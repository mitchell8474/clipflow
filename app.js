import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = "https://lyxytyubyigursfvbuda.supabase.co";
const SUPABASE_KEY = "sb_publishable_D6upXEm0w-3KL19JnEiwPg_CgSAD2CG";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

let user = null, feedMode = "fyp", observer;

const $ = s => document.querySelector(s);
const msg = (id, text) => $(id).textContent = text;

// --- Auth Tabs & Form Handlers ---
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
      if (!/^[a-z0-9_]{3,20}$/.test(username)) {
        throw Error("Username must be 3–20 letters, numbers or underscores.");
      }

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { username } }
      });
      if (error) throw error;

      if (data.session && data.user) {
        const { error: pErr } = await supabase
          .from("profiles")
          .insert({ id: data.user.id, username });
        if (pErr) throw pErr;
      } else {
        msg("#authMessage", "Account created! Check your email to confirm, then sign in.");
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    }
  } catch(e) { 
    msg("#authMessage", e.message); 
  }
};

$("#logoutBtn").onclick = () => supabase.auth.signOut();
document.querySelectorAll(".nav-btn").forEach(b => b.onclick = () => {
  feedMode = b.dataset.feed;
  document.querySelectorAll(".nav-btn").forEach(x => x.classList.remove("active"));
  b.classList.add("active"); loadFeed();
});

// --- Upload Handlers ---
$("#uploadOpenBtn").onclick = () => $("#uploadModal").classList.remove("hidden");
$("#uploadCloseBtn").onclick = () => $("#uploadModal").classList.add("hidden");

$("#uploadForm").onsubmit = async e => {
  e.preventDefault();
  const file = $("#videoFile").files[0];
  if (!file || !file.type.startsWith("video/")) return msg("#uploadMessage","Choose a video.");
  if (file.size > 100 * 1024 * 1024) return msg("#uploadMessage","Keep videos under 100 MB.");

  try {
    msg("#uploadMessage","Uploading...");

    const { data: { session } } = await supabase.auth.getSession();
    const activeUserId = session?.user?.id || user?.id;

    if (!activeUserId) throw new Error("Please log in again before uploading.");

    const { data: profile } = await supabase.from("profiles").select("id").eq("id", activeUserId).maybeSingle();
    if (!profile) {
      const tempUsername = "user_" + activeUserId.slice(0, 6);
      await supabase.from("profiles").insert({ id: activeUserId, username: tempUsername });
    }

    const path = `${activeUserId}/${crypto.randomUUID()}-${safeName(file.name)}`;
    const { error: uploadError } = await supabase.storage.from("videos").upload(path, file, { contentType: file.type, upsert: false });
    if (uploadError) throw uploadError;

    const { data: urlData } = supabase.storage.from("videos").getPublicUrl(path);

    const { error } = await supabase.from("videos").insert({
      owner_id: activeUserId,
      storage_path: path,
      video_url: urlData.publicUrl,
      caption: $("#caption").value.trim()
    });

    if (error) throw error;

    $("#uploadForm").reset();
    $("#uploadModal").classList.add("hidden");
    msg("#uploadMessage","");
    loadFeed();
  } catch(e) {
    console.error(e);
    msg("#uploadMessage", e.message);
  }
};

// --- Super Admin Panel Handlers ---
if ($("#adminOpenBtn")) {
  $("#adminOpenBtn").onclick = async () => {
    $("#adminModal").classList.remove("hidden");
    msg("#adminMessage", "");

    const { data: videos } = await supabase.from("videos").select("id, caption");
    const select = $("#adminVideoSelect");
    select.innerHTML = "";
    
    (videos || []).forEach(v => {
      const opt = document.createElement("option");
      opt.value = v.id;
      opt.textContent = v.caption ? v.caption.slice(0, 30) : v.id;
      select.appendChild(opt);
    });
  };
}

if ($("#adminCloseBtn")) {
  $("#adminCloseBtn").onclick = () => $("#adminModal").classList.add("hidden");
}

if ($("#addLikesBtn")) {
  $("#addLikesBtn").onclick = async () => {
    const videoId = $("#adminVideoSelect").value;
    if (!videoId) return;

    msg("#adminMessage", "Adding 5,000 likes...");
    const { error } = await supabase.rpc("admin_add_likes", { 
      target_video_id: videoId, 
      amount: 5000 
    });

    if (error) {
      msg("#adminMessage", "Error: " + error.message);
    } else {
      msg("#adminMessage", "Successfully added 5,000 likes!");
      loadFeed();
    }
  };
}

if ($("#deleteVideoBtn")) {
  $("#deleteVideoBtn").onclick = async () => {
    const videoId = $("#adminVideoSelect").value;
    if (!videoId) return;

    msg("#adminMessage", "Deleting video...");
    const { error } = await supabase.rpc("admin_delete_video", { 
      target_video_id: videoId 
    });

    if (error) {
      msg("#adminMessage", "Error: " + error.message);
    } else {
      msg("#adminMessage", "Video deleted!");
      $("#adminModal").classList.add("hidden");
      loadFeed();
    }
  };
}

// --- Main Feed & Interaction Logic ---
async function loadFeed() {
  const feed = $("#feed"); feed.innerHTML = "";

  let profile = { following: [], liked: [], reposted: [] };
  if (user) {
    const { data: pData } = await supabase
      .from("profiles")
      .select("username, following:following(following_id), liked:likes(video_id), reposted:reposts(video_id)")
      .eq("id", user.id)
      .maybeSingle();
    if (pData) profile = pData;
  }

  let { data: videos, error } = await supabase
    .from("videos")
    .select("id, owner_id, caption, video_url, created_at, profiles!owner_id(username), likes(count), reposts(count)")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching videos:", error.message);
    videos = [];
  }

  const following = (profile.following || []).map(x => x.following_id);
  if (feedMode === "following" && user) {
    videos = (videos || []).filter(v => following.includes(v.owner_id) || v.owner_id === user.id);
  }

  const liked = new Set((profile.liked || []).map(x => x.video_id));
  const reposted = new Set((profile.reposted || []).map(x => x.video_id));

  if (!videos || !videos.length) {
    feed.innerHTML = `<section class="video-card"><div style="margin:auto;text-align:center"><h2>No videos here yet.</h2><p>Upload one to get started!</p></div></section>`; 
    return;
  }

  for (const v of videos) {
    const card = document.createElement("article"); card.className = "video-card";
    const username = v.profiles?.username || "creator";
    const likeCount = v.likes?.[0]?.count || 0, repostCount = v.reposts?.[0]?.count || 0;
    const isFollowing = following.includes(v.owner_id);
    const isOwner = user && v.owner_id === user.id;

    card.innerHTML = `
      <video class="video-player" loop playsinline preload="metadata" muted src="${v.video_url}"></video>
      <div class="video-gradient"></div>
      <div class="video-info">
        <div class="creator-row">
          <button class="creator">@${esc(username)}</button>
          <button class="follow-btn ${isFollowing ? "following" : ""}">${isOwner ? "You" : isFollowing ? "Following" : "Follow"}</button>
        </div>
        <p class="caption">${esc(v.caption || "")}</p>
      </div>
      <div class="actions">
        <button class="action like-btn ${liked.has(v.id) ? "liked" : ""}"><span class="icon">♥</span><span class="count">${likeCount}</span></button>
        <button class="action repost-btn ${reposted.has(v.id) ? "reposted" : ""}"><span class="icon">↻</span><span class="count">${repostCount}</span></button>
      </div>`;

    const followBtn = card.querySelector(".follow-btn");
    const likeBtn = card.querySelector(".like-btn");
    const repostBtn = card.querySelector(".repost-btn");
    followBtn.disabled = isOwner;

    followBtn.onclick = async () => { 
      if (!user) return alert("Please sign in to follow creators.");

      const currentlyFollowing = followBtn.classList.contains("following");
      
      document.querySelectorAll(".video-card").forEach(c => {
        if (c.querySelector(".creator").textContent === `@${username}`) {
          const btn = c.querySelector(".follow-btn");
          if (btn && !btn.disabled) {
            btn.classList.toggle("following", !currentlyFollowing);
            btn.textContent = !currentlyFollowing ? "Following" : "Follow";
          }
        }
      });

      const { error } = await supabase.rpc("toggle_follow", { target_user_id: v.owner_id }); 
      if (error) {
        document.querySelectorAll(".video-card").forEach(c => {
          if (c.querySelector(".creator").textContent === `@${username}`) {
            const btn = c.querySelector(".follow-btn");
            if (btn && !btn.disabled) {
              btn.classList.toggle("following", currentlyFollowing);
              btn.textContent = currentlyFollowing ? "Following" : "Follow";
            }
          }
        });
        alert(error.message); 
      }
    };

    likeBtn.onclick = async () => { 
      if (!user) return alert("Please sign in to like videos.");

      const countEl = likeBtn.querySelector(".count");
      const isLiked = likeBtn.classList.contains("liked");
      let currentCount = parseInt(countEl.textContent, 10) || 0;

      likeBtn.classList.toggle("liked", !isLiked);
      countEl.textContent = !isLiked ? currentCount + 1 : Math.max(0, currentCount - 1);

      const { error } = await supabase.rpc("toggle_like", { target_video_id: v.id }); 
      if (error) {
        likeBtn.classList.toggle("liked", isLiked);
        countEl.textContent = currentCount;
        alert(error.message); 
      }
    };

    repostBtn.onclick = async () => { 
      if (!user) return alert("Please sign in to repost videos.");

      const countEl = repostBtn.querySelector(".count");
      const isReposted = repostBtn.classList.contains("reposted");
      let currentCount = parseInt(countEl.textContent, 10) || 0;

      repostBtn.classList.toggle("reposted", !isReposted);
      countEl.textContent = !isReposted ? currentCount + 1 : Math.max(0, currentCount - 1);

      const { error } = await supabase.rpc("toggle_repost", { target_video_id: v.id }); 
      if (error) {
        repostBtn.classList.toggle("reposted", isReposted);
        countEl.textContent = currentCount;
        alert(error.message); 
      }
    };

    feed.appendChild(card);
  }
  setupObserver();
}

function setupObserver() {
  if (observer) observer.disconnect();
  observer = new IntersectionObserver(entries => entries.forEach(e => {
    const v = e.target.querySelector("video");
    if (e.isIntersecting && e.intersectionRatio > 0.6) {
      document.querySelectorAll("video").forEach(x => x !== v && x.pause());
      v.play().catch(() => {});
    } else {
      v.pause();
    }
  }), { threshold: [0.6] });
  
  document.querySelectorAll(".video-card").forEach(x => observer.observe(x));
}

function safeName(n) { return n.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80); }
function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c])); }

// --- Auth State Change Listener ---
supabase.auth.onAuthStateChange(async (_event, session) => {
  user = session?.user || null;
  $("#authScreen").classList.toggle("hidden", !!user); 
  $("#app").classList.toggle("hidden", !user);
  
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("username, is_admin")
      .eq("id", user.id)
      .single();

    $("#currentUser").textContent = "@" + (profile?.username || user.email);

    const adminBtn = $("#adminOpenBtn");
    if (adminBtn) {
      adminBtn.classList.toggle("hidden", !profile?.is_admin);
    }

    loadFeed();
  } else {
    loadFeed();
  }
});
