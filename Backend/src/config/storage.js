const { postgresImageService } = require("../services/postgresImage.service");

class StorageService {
  async upload(file, options = {}) {
    return postgresImageService.upload(file, options);
  }

  async delete(key) {
    return postgresImageService.delete(key);
  }

  getUrl(key) {
    return postgresImageService.getUrl(key);
  }

  async getFileMetadata(key) {
    return postgresImageService.getFileMetadata(key);
  }

  getPlaceholderSvg() {
    return postgresImageService.getPlaceholderSvg();
  }
}

const storageServiceInstance = new StorageService();

module.exports = {
  StorageService,
  storageService: storageServiceInstance,
  postgresImageService
};
