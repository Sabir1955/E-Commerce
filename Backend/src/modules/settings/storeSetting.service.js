const StoreSetting = require("../../models/StoreSetting");
const { BadRequestError } = require("../../utils/errors");

const DEFAULT_STORE_SETTING = {
  key: "store_address",
  storeName: "Jyotish Astro Store",
  contactName: "Master Astrologer",
  phone: "+919876543210",
  addressLine: "108 Vedic Temple Marg, Near Ganga Ghat, Varanasi",
  city: "Varanasi",
  state: "Uttar Pradesh",
  pinCode: "221001",
  country: "India"
};

class StoreSettingService {
  formatSetting(doc) {
    const s = doc || DEFAULT_STORE_SETTING;
    const storeName = s.storeName || DEFAULT_STORE_SETTING.storeName;
    const contactName = s.contactName || s.fullName || DEFAULT_STORE_SETTING.contactName;
    const phone = s.phone || s.mobile || DEFAULT_STORE_SETTING.phone;
    const addressLine = s.addressLine || s.address || DEFAULT_STORE_SETTING.addressLine;
    const city = s.city || DEFAULT_STORE_SETTING.city;
    const state = s.state || DEFAULT_STORE_SETTING.state;
    const pinCode = s.pinCode || s.postalCode || DEFAULT_STORE_SETTING.pinCode;
    const country = s.country || DEFAULT_STORE_SETTING.country;

    const formattedAddress = [
      addressLine,
      city,
      state ? (state + (pinCode ? ` - ${pinCode}` : "")) : pinCode,
      country
    ].filter(Boolean).join(", ");

    const addressObj = {
      _id: s._id,
      fullName: contactName,
      contactName,
      mobile: phone,
      phone,
      address: addressLine,
      addressLine,
      city,
      state,
      postalCode: pinCode,
      pinCode,
      country,
      formattedAddress
    };

    return {
      _id: s._id,
      storeName,
      contactName,
      phone,
      addressLine,
      city,
      state,
      pinCode,
      country,
      // Compatibility aliases
      fullName: contactName,
      mobile: phone,
      postalCode: pinCode,
      formattedAddress,
      address: addressObj
    };
  }

  async getStoreSetting() {
    let setting = await StoreSetting.findOne({ key: "store_address" });
    if (!setting) {
      try {
        setting = await StoreSetting.create(DEFAULT_STORE_SETTING);
      } catch (err) {
        // Handle race condition if created simultaneously
        setting = await StoreSetting.findOne({ key: "store_address" });
        if (!setting) {
          setting = DEFAULT_STORE_SETTING;
        }
      }
    }
    return this.formatSetting(setting);
  }

  async updateStoreSetting(body = {}) {
    const storeName = body.storeName !== undefined ? String(body.storeName).trim() : undefined;
    const contactName = (body.contactName !== undefined ? body.contactName : (body.fullName !== undefined ? body.fullName : body.managerName));
    const phone = (body.phone !== undefined ? body.phone : (body.mobile !== undefined ? body.mobile : body.storePhone));
    const addressLine = (body.addressLine !== undefined ? body.addressLine : body.address);
    const city = body.city !== undefined ? String(body.city).trim() : undefined;
    const state = body.state !== undefined ? String(body.state).trim() : undefined;
    const pinCode = (body.pinCode !== undefined ? body.pinCode : body.postalCode);
    const country = body.country !== undefined ? String(body.country).trim() : undefined;

    let setting = await StoreSetting.findOne({ key: "store_address" });
    if (!setting) {
      setting = new StoreSetting(DEFAULT_STORE_SETTING);
    }

    if (storeName) setting.storeName = storeName;
    if (contactName !== undefined) setting.contactName = String(contactName).trim();
    if (phone !== undefined) setting.phone = String(phone).trim();
    if (addressLine !== undefined) setting.addressLine = String(addressLine).trim();
    if (city !== undefined) setting.city = String(city).trim();
    if (state !== undefined) setting.state = String(state).trim();
    if (pinCode !== undefined) setting.pinCode = String(pinCode).trim();
    if (country !== undefined) setting.country = String(country).trim();

    await setting.save();
    return this.formatSetting(setting);
  }
}

module.exports = new StoreSettingService();
