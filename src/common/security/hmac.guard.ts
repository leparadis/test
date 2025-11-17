import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { HmacService } from './hmac.service';

@Injectable()
export class HmacGuard implements CanActivate {
  private readonly logger = new Logger(HmacGuard.name);

  constructor(private readonly hmacService: HmacService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();

    const signature = request.headers['x-signature'];
    const timestamp = request.headers['x-timestamp'];

    if (!signature || !timestamp) {
      this.logger.warn('Missing signature or timestamp in headers');
      throw new UnauthorizedException('Missing signature or timestamp headers');
    }

    const payload = request.body;

    const isValid = this.hmacService.verify(payload, signature, timestamp);

    if (!isValid) {
      this.logger.warn('Invalid signature or timestamp skew detected', {
        timestamp,
        path: request.path,
      });
      throw new UnauthorizedException('Invalid signature or timestamp');
    }

    this.logger.debug('Signature validated successfully');
    return true;
  }
}
