function parsePagination(query, defaultLimit = 20, maxLimit = 100) {
  const page = query.page === undefined ? 1 : Number(query.page);
  const limit = query.limit === undefined ? defaultLimit : Number(query.limit);

  if (
    !Number.isSafeInteger(page) ||
    page < 1 ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > maxLimit ||
    (page - 1) * limit > 2147483647
  ) {
    return {
      error: `page must be a positive integer and limit must be between 1 and ${maxLimit}`
    };
  }

  return {
    page,
    limit,
    skip: (page - 1) * limit
  };
}

function formatPaginationMeta(total, page, limit) {
  return {
    page,
    limit,
    total,
    pages: Math.ceil(total / limit)
  };
}

module.exports = {
  pagination: parsePagination,
  parsePagination,
  formatPaginationMeta
};
