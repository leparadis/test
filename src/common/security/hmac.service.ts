import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

@Injectable()
export class HmacService {
  private readonly secret: string;
  private readonly timestampTolerance: number;

  constructor(private configService: ConfigService) {
    this.secret = this.configService.get<string>('HMAC_SECRET')!;
    this.timestampTolerance = parseInt(
      this.configService.get<string>('SIGNATURE_TIMESTAMP_TOLERANCE_SECONDS') ||
        '300',
    );

    if (!this.secret || this.secret.length < 32) {
      throw new Error('HMAC_SECRET must be at least 32 characters long');
    }
  }

  /**
   * Generate HMAC signature for a payload
   * @param payload - The data to sign
   * @param timestamp - Unix timestamp in seconds
   * @returns HMAC signature (hex)
   */
  generateSignature(payload: any, timestamp: number): string {
    const data = JSON.stringify(payload) + timestamp.toString();
    return crypto.createHmac('sha256', this.secret).update(data).digest('hex');
  }

  /**
   * Validate HMAC signature
   * @param payload - The data that was signed
   * @param signature - The signature to validate
   * @param timestamp - Unix timestamp in seconds
   * @returns true if signature is valid and timestamp is within tolerance
   */
  validateSignature(
    payload: any,
    signature: string,
    timestamp: number,
  ): boolean {
    const now = Math.floor(Date.now() / 1000);
    const timeDiff = Math.abs(now - timestamp);

    if (timeDiff > this.timestampTolerance) {
      return false;
    }

    // Validate signature format before comparison
    if (!signature || typeof signature !== 'string') {
      return false;
    }

    // Remove any whitespace and validate hex format
    const cleanSignature = signature.trim().replace(/[^0-9a-fA-F]/g, '');

    // SHA-256 hex should be exactly 64 characters
    if (cleanSignature.length !== 64) {
      return false;
    }

    const expectedSignature = this.generateSignature(payload, timestamp);

    // Safe to compare now - both buffers will be same length
    try {
      return crypto.timingSafeEqual(
        Buffer.from(cleanSignature, 'hex'),
        Buffer.from(expectedSignature, 'hex'),
      );
    } catch (error) {
      // If buffer conversion fails for any reason
      return false;
    }
  }

  /**
   * Generate signature with current timestamp
   * @param payload - The data to sign
   * @returns Object with signature and timestamp
   */
  sign(payload: any): { signature: string; timestamp: number } {
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = this.generateSignature(payload, timestamp);
    return { signature, timestamp };
  }

  /**
   * Verify signature with automatic timestamp extraction
   * @param payload - The data that was signed
   * @param signature - The signature to validate
   * @param timestamp - Unix timestamp in seconds (string or number)
   * @returns true if valid
   */
  verify(payload: any, signature: string, timestamp: string | number): boolean {
    const ts = typeof timestamp === 'string' ? parseInt(timestamp) : timestamp;

    if (isNaN(ts)) {
      return false;
    }

    return this.validateSignature(payload, signature, ts);
  }
}
