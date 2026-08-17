import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = "https://lyxytyubyigursfvbuda.supabase.co";
const SUPABASE_KEY = "sb_publishable_D6upXEm0w-3KL19JnEiwPg_CgSAD2CG";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

let user = null, feedMode = "fyp", observer;
let currentVideoIdForComments = null;
let currentVideoOwnerIdForComments = null;
let replyingToCommentId = null;

const $ = s => document.querySelector(s);
const msg = (id, text) => $(id).textContent = text;

// --- Auth ---
document.querySelectorAll(".tab").forEach(b => b.onclick = () => {
  document.querySelectorAll(".tab").forEach(x => x.classList.remove("active"));
  b.classList.add("active");
  const signup = b.dataset.mode === "signup";
  $("#username").classList.toggle("hidden", !signup);
  $("#authSubmit").textContent = signup ? "Create account" : "Sign in";
  msg("#authMessage","");
});

$("#authForm").onsubmit = async e => {
  e.preventDefault();
  const email = $("#email").value.trim();
  const password = $("#password").value;
  const signup = $("#authSubmit").textContent === "Create account";

  try {
    if (signup) {
      const username = $("#username").value.trim().toLowerCase();
      if (!/^[a-z0-9_]{3,20}$/.test(username)) throw Error("Username 3–20 chars.");
      const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { username } } });
      if (error) throw error;
      if (data.user) await supabase.from("profiles").insert({ id: data.user.id, username });
      msg("#authMessage", "Account created! Check email to confirm, then sign in.");
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    }
  } catch(e) { msg("#authMessage", e.message); }
};

$("#logoutBtn").onclick = () => supabase.auth.signOut();
document.querySelectorAll(".nav-btn").forEach(b => b.onclick = () => {
  feedMode = b.dataset.feed;
  document.querySelectorAll(".nav-btn").forEach(x => x.classList.remove("active"));
  b.classList.add("active"); loadFeed();
});

// --- Upload ---
$("#uploadOpenBtn").onclick = () => $("#uploadModal").classList.remove("hidden");
$("#uploadCloseBtn").onclick = () => $("#uploadModal").classList.add("hidden");

$("#uploadForm").onsubmit = async e => {
  e.preventDefault();
  const file = $("#videoFile").files[0];
  if (!file || !file.type.startsWith("video/")) return msg("#uploadMessage","Choose a video.");
  try {
    msg("#uploadMessage","Uploading...");
    const activeUserId = user?.id;
    if (!activeUserId) throw new Error("Log in again.");
    const path = `${activeUserId}/${crypto.randomUUID()}-${safeName(file.name)}`;
    const { error: uploadError } = await supabase.storage.from("videos").upload(path, file);
    if (uploadError) throw uploadError;
    const { data: urlData } = supabase.storage.from("videos").getPublicUrl(path);
    const { error } = await supabase.from("videos").insert({ owner_id: activeUserId, storage_path: path, video_url: urlData.publicUrl, caption: $("#caption").value.trim() });
    if (error) throw error;
    $("#uploadForm").reset(); $("#uploadModal").classList.add("hidden"); msg("#uploadMessage",""); loadFeed();
  } catch(e) { msg("#uploadMessage", e.message); }
};

// --- Super Admin Panel Handlers ---
const adminOpenBtn = $("#adminOpenBtn");
if (adminOpenBtn) {
  adminOpenBtn.onclick = async () => {
    $("#adminModal").classList.remove("hidden"); msg("#adminMessage", "");
    const { data: videos } = await supabase.from("videos").select("id, caption");
    const select = $("#adminVideoSelect"); select.innerHTML = "";
    (videos || []).forEach(v => {
      const opt = document.createElement("option"); opt.value = v.id; opt.textContent = v.caption ? v.caption.slice(0, 30) : v.id; select.appendChild(opt);
    });
  };
}
$("#adminCloseBtn").onclick = () => $("#adminModal").classList.add("hidden");

$("#addLikesBtn").onclick = async () => {
  const videoId = $("#adminVideoSelect").value;
  if (!videoId) return;
  msg("#adminMessage", "Adding likes...");
  const { error } = await supabase.rpc("admin_add_likes", { target_video_id: videoId, amount: 5000 });
  error ? msg("#adminMessage", error.message) : (msg("#adminMessage", "Added!"), loadFeed());
};

$("#deleteVideoBtn").onclick = async () => {
  const videoId = $("#adminVideoSelect").value;
  if (!videoId) return;
  msg("#adminMessage", "Deleting...");
  const { error } = await supabase.rpc("admin_delete_video", { target_video_id: videoId });
  error ? msg("#adminMessage", error.message) : ($("#adminModal").classList.add("hidden"), loadFeed());
};

// --- Comments Logic ---
$("#commentsCloseBtn").onclick = () => {
  $("#commentsModal").classList.add("hidden");
  resetReplyState();
};

$("#cancelReplyBtn").onclick = resetReplyState;

function resetReplyState() {
  replyingToCommentId = null;
  $("#replyingToIndicator").classList.add("hidden");
  $("#commentInput").placeholder = "Add a comment...";
}

async function openComments(videoId, ownerId) {
  currentVideoIdForComments = videoId;
  currentVideoOwnerIdForComments = ownerId;
  resetReplyState();
  $("#commentsModal").classList.remove("hidden");
  loadComments();
}

async function loadComments() {
  const list = $("#commentsList");
  list.innerHTML = "<p style='text-align:center;color:#888;'>Loading...</p>";
  
  const { data: comments, error } = await supabase
    .from("comments")
    .select(`
      id, content, parent_id, user_id, created_at,
      profiles(username),
      comment_likes(user_id)
    `)
    .eq("video_id", currentVideoIdForComments)
    .order("created_at", { ascending: true });

  if (error) { list.innerHTML = `<p>Error loading comments</p>`; return; }
  
  list.innerHTML = "";
  if (!comments.length) {
    list.innerHTML = "<p style='text-align:center;color:#888;'>No comments yet.</p>";
    return;
  }

  // Organize top level and replies
  const topLevel = comments.filter(c => !c.parent_id);
  const replies = comments.filter(c => c.parent_id);

  topLevel.forEach(c => {
    list.appendChild(createCommentElement(c, comments));
    // append replies directly under parent
    const childReplies = replies.filter(r => r.parent_id === c.id);
    childReplies.forEach(r => {
      list.appendChild(createCommentElement(r, comments, true));
    });
  });
}

function createCommentElement(c, allComments, isReply = false) {
  const div = document.createElement("div");
  div.className = `comment-item ${isReply ? "reply" : ""}`;
  
  const username = c.profiles?.username || "user";
  const myLike = user && c.comment_likes.some(l => l.user_id === user.id);
  const creatorLiked = c.comment_likes.some(l => l.user_id === currentVideoOwnerIdForComments);
  const isMyComment = user && c.user_id === user.id;

  div.innerHTML = `
    <div class="comment-body">
      <div class="comment-user">@${esc(username)}</div>
      <div class="comment-text">${esc(c.content)}</div>
      ${creatorLiked ? `<div class="creator-liked">Liked by creator ❤️</div>` : ""}
      <div class="comment-actions">
        <button class="c-action-btn reply-btn" data-id="${isReply ? c.parent_id : c.id}" data-name="${esc(username)}">Reply</button>
        ${isMyComment ? `<button class="c-action-btn delete-c-btn" data-id="${c.id}">Delete</button>` : ""}
      </div>
    </div>
    <div class="comment-right c-like-wrapper" data-id="${c.id}">
      <span class="c-like-icon ${myLike ? "liked" : ""}">♥</span>
      <span>${c.comment_likes.length}</span>
    </div>
  `;

  // Bind Reply
  div.querySelector(".reply-btn").onclick = (e) => {
    replyingToCommentId = e.target.dataset.id;
    $("#replyingToIndicator").classList.remove("hidden");
    $("#replyingToName").textContent = "@" + e.target.dataset.name;
    $("#commentInput").focus();
  };

  // Bind Delete
  const delBtn = div.querySelector(".delete-c-btn");
  if (delBtn) {
    delBtn.onclick = async (e) => {
      if(!confirm("Delete comment?")) return;
      await supabase.from("comments").delete().eq("id", e.target.dataset.id);
      loadComments();
    };
  }

  // Bind Like
  div.querySelector(".c-like-wrapper").onclick = async (e) => {
    if (!user) return alert("Log in to like comments");
    const commentId = e.currentTarget.dataset.id;
    if (myLike) {
      await supabase.from("comment_likes").delete().eq("comment_id", commentId).eq("user_id", user.id);
    } else {
      await supabase.from("comment_likes").insert({ comment_id: commentId, user_id: user.id });
    }
    loadComments();
  };

  return div;
}

$("#commentForm").onsubmit = async (e) => {
  e.preventDefault();
  if (!user) return alert("Please log in to comment.");
  
  const content = $("#commentInput").value.trim();
  if (!content) return;

  const { error } = await supabase.from("comments").insert({
    video_id: currentVideoIdForComments,
    user_id: user.id,
    content: content,
    parent_id: replyingToCommentId // will be null if not replying
  });

  if (error) alert("Error: " + error.message);
  else {
    $("#commentInput").value = "";
    resetReplyState();
    loadComments();
  }
};


// --- Main Feed ---
async function loadFeed() {
  const feed = $("#feed"); feed.innerHTML = "";
  let profile = { following: [], liked: [], reposted: [] };
  
  if (user) {
    const [followsRes, likesRes, repostsRes] = await Promise.all([
      supabase.from("follows").select("following_id").eq("follower_id", user.id),
      supabase.from("likes").select("video_id").eq("user_id", user.id),
      supabase.from("reposts").select("video_id").eq("user_id", user.id)
    ]);
    profile.following = (followsRes.data || []).map(x => x.following_id);
    profile.liked = (likesRes.data || []).map(x => x.video_id);
    profile.reposted = (repostsRes.data || []).map(x => x.video_id);
  }

  let { data: videos, error } = await supabase
    .from("videos")
    .select("id, owner_id, caption, video_url, created_at, profiles!owner_id(username), likes(count), reposts(count), comments(count)")
    .order("created_at", { ascending: false });

  if (error) { console.error(error); videos = []; }

  const following = profile.following || [];
  if (feedMode === "following" && user) videos = (videos || []).filter(v => following.includes(v.owner_id));

  if (!videos || !videos.length) {
    feed.innerHTML = `<section class="video-card"><div style="margin:auto;text-align:center"><h2>No videos yet.</h2></div></section>`; 
    return;
  }

  videos.forEach((v) => {
    const card = document.createElement("article"); card.className = "video-card";
    const username = v.profiles?.username || "creator";
    const likeCount = v.likes?.[0]?.count || 0;
    const repostCount = v.reposts?.[0]?.count || 0;
    const commentCount = v.comments?.[0]?.count || 0;
    const isFollowing = following.includes(v.owner_id);
    const isOwner = user && v.owner_id === user.id;

    card.innerHTML = `
      <video class="video-player" loop playsinline preload="metadata" muted data-src="${v.video_url}"></video>
      <div class="video-gradient"></div>
      <div class="video-info">
        <div class="creator-row">
          <button class="creator">@${esc(username)}</button>
          <button class="follow-btn ${isFollowing ? "following" : ""}">${isOwner ? "You" : isFollowing ? "Following" : "Follow"}</button>
        </div>
        <p class="caption">${esc(v.caption || "")}</p>
      </div>
      <div class="actions">
        <button class="action like-btn ${new Set(profile.liked).has(v.id) ? "liked" : ""}"><span class="icon">♥</span><span class="count">${likeCount}</span></button>
        <button class="action comment-btn"><span class="icon">💬</span><span class="count">${commentCount}</span></button>
        <button class="action repost-btn ${new Set(profile.reposted).has(v.id) ? "reposted" : ""}"><span class="icon">↻</span><span class="count">${repostCount}</span></button>
      </div>`;

    // Follow Logic
    const followBtn = card.querySelector(".follow-btn"); followBtn.disabled = isOwner;
    followBtn.onclick = async () => { 
      if (!user) return alert("Sign in to follow.");
      const currentlyFollowing = followBtn.classList.contains("following");
      currentlyFollowing 
        ? await supabase.from("follows").delete().eq("follower_id", user.id).eq("following_id", v.owner_id)
        : await supabase.from("follows").insert({ follower_id: user.id, following_id: v.owner_id });
      loadFeed();
    };

    // Like Logic
    const likeBtn = card.querySelector(".like-btn");
    likeBtn.onclick = async () => { 
      if (!user) return alert("Sign in to like.");
      const isLiked = likeBtn.classList.contains("liked");
      isLiked 
        ? await supabase.from("likes").delete().eq("user_id", user.id).eq("video_id", v.id)
        : await supabase.from("likes").insert({ user_id: user.id, video_id: v.id });
      loadFeed();
    };

    // Repost Logic
    const repostBtn = card.querySelector(".repost-btn");
    repostBtn.onclick = async () => { 
      if (!user) return alert("Sign in to repost.");
      const isReposted = repostBtn.classList.contains("reposted");
      isReposted
        ? await supabase.from("reposts").delete().eq("user_id", user.id).eq("video_id", v.id)
        : await supabase.from("reposts").insert({ user_id: user.id, video_id: v.id });
      loadFeed();
    };

    // Comment Button Logic
    card.querySelector(".comment-btn").onclick = () => openComments(v.id, v.owner_id);

    feed.appendChild(card);
  });

  setupObserver();
}

function setupObserver() {
  if (observer) observer.disconnect();
  const cards = Array.from(document.querySelectorAll(".video-card"));
  observer = new IntersectionObserver(entries => {
    entries.forEach(e => {
      const v = e.target.querySelector("video");
      if (e.isIntersecting) {
        if (!v.src) v.src = v.dataset.src;
        document.querySelectorAll("video").forEach(x => { if (x !== v) x.pause(); });
        v.play().catch(()=>{});
      } else v.pause();
    });
  }, { threshold: [0.6] });
  cards.forEach(x => observer.observe(x));
}

function safeName(n) { return n.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80); }
function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c])); }

// --- Auth State ---
supabase.auth.onAuthStateChange(async (_event, session) => {
  user = session?.user || null;
  $("#authScreen").classList.toggle("hidden", !!user); 
  $("#app").classList.toggle("hidden", !user);
  if (user) {
    const { data: profile } = await supabase.from("profiles").select("username, is_admin").eq("id", user.id).maybeSingle();
    $("#currentUser").textContent = "@" + (profile?.username || user.email);
    if ($("#adminOpenBtn")) $("#adminOpenBtn").classList.toggle("hidden", !profile?.is_admin);
  }
  loadFeed();
});
