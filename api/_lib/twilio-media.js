const MAX_MEDIA_BYTES = 7 * 1024 * 1024;

async function fetchTwilioMedia(url) {
  if (!url) return null;

  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) {
    throw new Error("twilio_media_auth_missing");
  }

  const response = await fetch(url, {
    headers: {
      Authorization: "Basic " + Buffer.from(`${sid}:${token}`).toString("base64"),
    },
  });

  if (!response.ok) {
    throw new Error(`twilio_media_fetch_${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  if (buffer.length > MAX_MEDIA_BYTES) {
    throw new Error("twilio_media_too_large");
  }

  return {
    buffer,
    contentType: response.headers.get("content-type") || "application/octet-stream",
  };
}

module.exports = {
  fetchTwilioMedia,
  MAX_MEDIA_BYTES,
};
