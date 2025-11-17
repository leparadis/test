import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name);
  private readonly requestsPerMinute = 60;
  private readonly windowMs = 60000;

  private requests: Map<string, number[]> = new Map();

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();

    // Use IP or a fixed key for testing
    const key = request.ip || 'default';
    const now = Date.now();

    // Get existing requests for this key
    let requestTimestamps = this.requests.get(key) || [];

    // Remove timestamps older than window
    requestTimestamps = requestTimestamps.filter(
      (timestamp) => now - timestamp < this.windowMs,
    );

    // Check if rate limit exceeded
    if (requestTimestamps.length >= this.requestsPerMinute) {
      const oldestRequest = requestTimestamps[0];
      const retryAfter = Math.ceil(
        (oldestRequest + this.windowMs - now) / 1000,
      );

      response.setHeader('Retry-After', retryAfter.toString());
      response.setHeader(
        'X-RateLimit-Limit',
        this.requestsPerMinute.toString(),
      );
      response.setHeader('X-RateLimit-Remaining', '0');
      response.setHeader(
        'X-RateLimit-Reset',
        new Date(oldestRequest + this.windowMs).toISOString(),
      );

      this.logger.warn({
        message: 'Rate limit exceeded',
        key,
        requestCount: requestTimestamps.length,
        retryAfter,
      });

      throw new HttpException(
        {
          statusCode: 429,
          message: 'Rate limit exceeded',
          retryAfter,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Add current request
    requestTimestamps.push(now);
    this.requests.set(key, requestTimestamps);

    // Set rate limit headers
    response.setHeader('X-RateLimit-Limit', this.requestsPerMinute.toString());
    response.setHeader(
      'X-RateLimit-Remaining',
      (this.requestsPerMinute - requestTimestamps.length).toString(),
    );
    response.setHeader(
      'X-RateLimit-Reset',
      new Date(now + this.windowMs).toISOString(),
    );

    return true;
  }
}
