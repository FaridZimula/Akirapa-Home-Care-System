"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.encrypt = encrypt;
exports.decrypt = decrypt;
var crypto_1 = require("crypto");
var ALGORITHM = 'aes-256-gcm';
// Default key for development/prototyping. In production, use process.env.ENCRYPTION_KEY
var ENCRYPTION_KEY = process.env.ENCRYPTION_KEY
    ? crypto_1.default.scryptSync(process.env.ENCRYPTION_KEY, 'salt', 32)
    : Buffer.from('f656723d-dcf3-4586-be53-866a23bc'.substring(0, 32), 'utf-8'); // 32 bytes
function encrypt(text) {
    var iv = crypto_1.default.randomBytes(12);
    var cipher = crypto_1.default.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
    var encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    var authTag = cipher.getAuthTag().toString('hex');
    // Format: iv:authTag:encryptedData
    return "".concat(iv.toString('hex'), ":").concat(authTag, ":").concat(encrypted);
}
function decrypt(encryptedText) {
    try {
        var parts = encryptedText.split(':');
        if (parts.length !== 3) {
            throw new Error('Invalid encrypted text format');
        }
        var iv = Buffer.from(parts[0], 'hex');
        var authTag = Buffer.from(parts[1], 'hex');
        var encryptedData = parts[2];
        var decipher = crypto_1.default.createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
        decipher.setAuthTag(authTag);
        var decrypted = decipher.update(encryptedData, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    }
    catch (error) {
        console.error('Decryption failed:', error);
        return '[Encrypted Content - Decryption Failed]';
    }
}
