import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = "https://lyxytyubyigursfvbuda.supabase.co";
const SUPABASE_KEY = "sb_publishable_D6upXEm0w-3KL19JnEiwPg_CgSAD2CG";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

let user = null, feedMode = "fyp", observer;

const $ = s => document.querySelector(s);
const msg = (id, text) => $(id).textContent = text;

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

$("#uploadOpenBtn").onclick = () => $("#uploadModal").classList.remove("hidden");
$("#uploadCloseBtn").onclick = () => $("#uploadModal").classList.add("hidden");

$("#uploadForm").onsubmit = async e => {
  e.preventDefault();
  const file = $("#videoFile").files[0];
  if (!file || !file.type.startsWith("video/")) return msg("#uploadMessage","Choose a video.");
  if (file.size > 100 * 1024 * 1024) return msg("#uploadMessage","Keep videos under 100 MB.");

  try {
    msg("#uploadMessage","Uploading...");

    // Fetch active session user ID dynamically to prevent stale state mismatches
    const { data: { session } } = await supabase.auth.getSession();
    const activeUserId = session?.user?.id || user?.id;

    if (!activeUserId) throw new Error("Please log in again before uploading.");

    // Fallback check to guarantee profile exists in public.profiles table
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

async function loadFeed() {
  const feed = $("#feed"); feed.innerHTML = "";

  // 1. Fetch User Profile Relations safely
  let profile = { following: [], liked: [], reposted: [] };
  if (user) {
    const { data: pData } = await supabase
      .from("profiles")
      .select("username, following:following(following_id), liked:likes(video_id), reposted:reposts(video_id)")
      .eq("id", user.id)
      .maybeSingle();
    if (pData) profile = pData;
  }

  // 2. Query Videos (Explicitly referencing owner_id relation)
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

  // 3. Build & Render Cards
  for (const v of videos) {
    const card = document.createElement("article"); card.className = "video-card";
    const username = v.profiles?.username || "creator";
    const likeCount = v.likes?.[0]?.count || 0, repostCount = v.reposts?.[0]?.count || 0;
    const isFollowing = following.includes(v.owner_id);
    const isOwner = user && v.owner_id === v.owner_id;

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
        <button class="action like-btn ${liked.has(v.id) ? "liked" : ""}"><span class="icon">♥</span><span>${likeCount}</span></button>
        <button class="action repost-btn ${reposted.has(v.id) ? "reposted" : ""}"><span class="icon">↻</span><span>${repostCount}</span></button>
      </div>`;

    const followBtn = card.querySelector(".follow-btn"), likeBtn = card.querySelector(".like-btn"), repostBtn = card.querySelector(".repost-btn");
    followBtn.disabled = isOwner;

    followBtn.onclick = async () => { 
      const { error } = await supabase.rpc("toggle_follow", { target_user_id: v.owner_id }); 
      if (error) alert(error.message); else loadFeed(); 
    };
    likeBtn.onclick = async () => { 
      const { error } = await supabase.rpc("toggle_like", { target_video_id: v.id }); 
      if (error) alert(error.message); else loadFeed(); 
    };
    repostBtn.onclick = async () => { 
      const { error } = await supabase.rpc("toggle_repost", { target_video_id: v.id }); 
      if (error) alert(error.message); else loadFeed(); 
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

supabase.auth.onAuthStateChange((_event, session) => {
  user = session?.user || null;
  $("#authScreen").classList.toggle("hidden", !!user); 
  $("#app").classList.toggle("hidden", !user);
  
  if (user) {
    supabase.from("profiles").select("username").eq("id", user.id).single().then(({ data }) => {
      $("#currentUser").textContent = "@" + (data?.username || user.email); 
      loadFeed();
    });
  } else {
    loadFeed();
  }
});
