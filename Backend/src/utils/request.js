function pagination(query, defaultLimit = 20, maxLimit = 100) {
  const page = query.page === undefined ? 1 : Number(query.page);
  const limit = query.limit === undefined ? defaultLimit : Number(query.limit);
  if (!Number.isSafeInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > maxLimit ||
      (page - 1) * limit > 2147483647) {
    return { error: `page must be a positive integer and limit must be between 1 and ${maxLimit}` };
  }
  return { page, limit, skip: (page - 1) * limit };
}

function isNonNegativeNumber(value) {
  return (typeof value === "number" ||
    (typeof value === "string" && value.trim() !== "")) &&
    Number.isFinite(Number(value)) && Number(value) >= 0;
}

function isNonNegativeInteger(value) {
  return isNonNegativeNumber(value) && Number.isInteger(Number(value));
}

function isValidEmail(email) {
  return typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidIndianMobile(mobile) {
  return typeof mobile === "string" && /^(?:\+91[- ]?)?[6-9]\d{9}$/.test(mobile.trim());
}

function validAddress(address) {
  if (!address || typeof address !== "object" || Array.isArray(address)) return false;
  const required = ["fullName", "address", "city", "state", "postalCode", "country", "mobile"];
  if (required.some((field) => typeof address[field] !== "string" || !address[field].trim())) return false;
  if (!isValidIndianMobile(address.mobile)) return false;
  return address.fullName.trim().length <= 100 &&
    address.address.trim().length <= 500 &&
    address.city.trim().length <= 100 &&
    address.state.trim().length <= 100 &&
    address.postalCode.trim().length <= 12 &&
    address.country.trim().length <= 100;
}

module.exports = {
  pagination,
  isNonNegativeNumber,
  isNonNegativeInteger,
  isValidEmail,
  isValidIndianMobile,
  validAddress
};
