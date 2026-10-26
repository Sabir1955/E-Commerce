const axios = require("axios");
let token;
async function authenticate() {
  if (!process.env.SHIPROCKET_EMAIL || !process.env.SHIPROCKET_PASSWORD) {
    const error = new Error("Shiprocket is not configured"); error.statusCode = 503; throw error;
  }
  const response = await axios.post("https://apiv2.shiprocket.in/v1/external/auth/login", {
    email: process.env.SHIPROCKET_EMAIL, password: process.env.SHIPROCKET_PASSWORD
  });
  token = response.data.token; return token;
}
async function request(method, path, data) {
  if (!token) await authenticate();
  try {
    return (await axios({ method, url: `https://apiv2.shiprocket.in/v1/external${path}`, data,
      headers: { Authorization: `Bearer ${token}` } })).data;
  } catch (error) {
    if (error.response && error.response.status === 401) { token = null; return request(method, path, data); }
    throw error;
  }
}
module.exports = { createShipment: (data) => request("post", "/orders/create/adhoc", data),
  trackShipment: (awb) => request("get", `/courier/track/awb/${encodeURIComponent(awb)}`) };
