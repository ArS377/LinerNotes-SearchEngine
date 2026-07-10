import { createClient } from "@supabase/supabase-js";

let supabase;

function configuration() {
  return {
    url: process.env.SUPABASE_URL?.trim(),
    key: process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  };
}

export function libraryConfigured() {
  const { url, key } = configuration();
  return Boolean(url && key);
}

function database() {
  if (!libraryConfigured()) {
    const error = new Error("Library persistence is not configured");
    error.code = "NOT_CONFIGURED";
    throw error;
  }
  if (!supabase) {
    const { url, key } = configuration();
    supabase = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
  }
  return supabase;
}

export async function authenticate(authorization) {
  const token = String(authorization || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    const error = new Error("Authentication required");
    error.code = "UNAUTHORIZED";
    throw error;
  }
  const { data, error } = await database().auth.getUser(token);
  if (error || !data.user) {
    const authError = new Error("Invalid or expired session");
    authError.code = "UNAUTHORIZED";
    throw authError;
  }
  return data.user;
}

function throwDatabaseError(error) {
  if (error) {
    const databaseError = new Error("Persistence operation failed");
    databaseError.code = "DATABASE_ERROR";
    databaseError.cause = error;
    throw databaseError;
  }
}

export async function listSaved(userId) {
  const { data, error } = await database()
    .from("saved_recordings")
    .select("recording_slug,title,artist,artwork_url,saved_at")
    .eq("user_id", userId)
    .order("saved_at", { ascending: false });
  throwDatabaseError(error);
  return data || [];
}

export async function saveRecording(userId, recording) {
  const row = {
    user_id: userId,
    recording_slug: recording.slug,
    title: recording.title,
    artist: recording.artist,
    artwork_url: recording.artworkUrl || null
  };
  const { data, error } = await database()
    .from("saved_recordings")
    .upsert(row)
    .select()
    .single();
  throwDatabaseError(error);
  return data;
}

export async function removeSaved(userId, slug) {
  const { error } = await database()
    .from("saved_recordings")
    .delete()
    .eq("user_id", userId)
    .eq("recording_slug", slug);
  throwDatabaseError(error);
}

export async function listHistory(userId) {
  const { data, error } = await database()
    .from("search_history")
    .select("id,query,searched_at")
    .eq("user_id", userId)
    .order("searched_at", { ascending: false })
    .limit(50);
  throwDatabaseError(error);
  return data || [];
}

export async function addHistory(userId, query) {
  const { error } = await database().from("search_history").insert({
    user_id: userId,
    query: String(query).trim().slice(0, 200)
  });
  throwDatabaseError(error);
}

export async function clearHistory(userId) {
  const { error } = await database().from("search_history").delete().eq("user_id", userId);
  throwDatabaseError(error);
}

export async function exportAccount(userId) {
  const [saved, history] = await Promise.all([listSaved(userId), listHistory(userId)]);
  return { exportedAt: new Date().toISOString(), saved, history };
}

export async function deleteAccount(userId) {
  const { error } = await database().auth.admin.deleteUser(userId);
  throwDatabaseError(error);
}

export function setLibraryClientForTests(client) {
  supabase = client;
}
