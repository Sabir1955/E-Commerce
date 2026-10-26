async function test() {
  const env = require('../config/env');
  const keyId = env.env.RAZORPAY_KEY_ID || 'rzp_test_1kVScwxkKk1123';
  console.log('Using keyId:', keyId);
  const res = await fetch(`https://api.razorpay.com/v1/preferences?key_id=${keyId}`);
  const text = await res.text();
  console.log('Preferences response status:', res.status, 'length:', text.length);
  const json = JSON.parse(text);
  console.log('Methods:', Object.keys(json.methods || {}));
  const urls = text.match(/https?:\/\/[^"\s]+/g) || [];
  console.log('Found URLs in preferences:', Array.from(new Set(urls)));
  
  // Search for png or images in the json
  const findImages = (obj) => {
    let results = [];
    for (let k in obj) {
      if (typeof obj[k] === 'string' && (obj[k].includes('.png') || obj[k].includes('.jpg') || obj[k].includes('.svg') || obj[k].includes('http'))) {
        results.push({ key: k, val: obj[k] });
      } else if (typeof obj[k] === 'object' && obj[k]) {
        results = results.concat(findImages(obj[k]));
      }
    }
    return results;
  };
  const images = findImages(json);
  console.log('netbanking sample:', JSON.stringify(json.methods.netbanking).slice(0, 500));
  console.log('wallet sample:', JSON.stringify(json.methods.wallet).slice(0, 500));
  console.log('apps sample:', JSON.stringify(json.methods.app).slice(0, 500));
  console.log('app_meta:', JSON.stringify(json.methods.app_meta).slice(0, 500));
}

test().catch(console.error);
