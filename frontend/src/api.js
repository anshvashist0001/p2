let csrf = "";
export async function api(path, data) {
  const res = await fetch("/api/" + path, {
    credentials: "same-origin",
    method: data === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json", "X-CSRFToken": csrf },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
  const body = await res
    .json()
    .catch(() => ({ error: "The server could not complete this request." }));
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  if (body.csrf) csrf = body.csrf;
  return body;
}
