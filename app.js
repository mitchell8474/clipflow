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

    // Follow Logic (Instant UI Update)
    const followBtn = card.querySelector(".follow-btn"); followBtn.disabled = isOwner;
    followBtn.onclick = async () => { 
      if (!user) return alert("Sign in to follow.");
      const currentlyFollowing = followBtn.classList.contains("following");
      if (currentlyFollowing) {
        followBtn.classList.remove("following"); followBtn.textContent = "Follow";
        await supabase.from("follows").delete().eq("follower_id", user.id).eq("following_id", v.owner_id);
      } else {
        followBtn.classList.add("following"); followBtn.textContent = "Following";
        await supabase.from("follows").insert({ follower_id: user.id, following_id: v.owner_id });
      }
    };

    // Like Logic (Instant UI Update)
    const likeBtn = card.querySelector(".like-btn");
    likeBtn.onclick = async () => { 
      if (!user) return alert("Sign in to like.");
      const isLiked = likeBtn.classList.contains("liked");
      const countSpan = likeBtn.querySelector(".count");
      let currentCount = parseInt(countSpan.textContent) || 0;
      
      if (isLiked) {
        likeBtn.classList.remove("liked"); countSpan.textContent = currentCount - 1;
        await supabase.from("likes").delete().eq("user_id", user.id).eq("video_id", v.id);
      } else {
        likeBtn.classList.add("liked"); countSpan.textContent = currentCount + 1;
        await supabase.from("likes").insert({ user_id: user.id, video_id: v.id });
      }
    };

    // Repost Logic (Instant UI Update)
    const repostBtn = card.querySelector(".repost-btn");
    repostBtn.onclick = async () => { 
      if (!user) return alert("Sign in to repost.");
      const isReposted = repostBtn.classList.contains("reposted");
      const countSpan = repostBtn.querySelector(".count");
      let currentCount = parseInt(countSpan.textContent) || 0;
      
      if (isReposted) {
        repostBtn.classList.remove("reposted"); countSpan.textContent = currentCount - 1;
        await supabase.from("reposts").delete().eq("user_id", user.id).eq("video_id", v.id);
      } else {
        repostBtn.classList.add("reposted"); countSpan.textContent = currentCount + 1;
        await supabase.from("reposts").insert({ user_id: user.id, video_id: v.id });
      }
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
  
  // Force the first video to load its source instantly instead of waiting
  if(cards.length > 0) {
    const firstVideo = cards[0].querySelector("video");
    firstVideo.src = firstVideo.dataset.src;
  }

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
