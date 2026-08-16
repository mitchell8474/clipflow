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

      // Pass the username in user metadata during sign-up
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { username }
        }
      });
      if (error) throw error;

      // If session exists (email confirmation disabled), create profile
      if (data.session) {
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
  } catch (e) { 
    msg("#authMessage", e.message); 
  }
};
