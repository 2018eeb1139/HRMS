import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common'
import { ZodError } from 'zod'
import { fail } from '@picode-hr/shared'
import type { Response } from 'express'

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exception')

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>()

    if (exception instanceof ZodError) {
      const msg = exception.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ')
      return res.status(HttpStatus.BAD_REQUEST).json(fail(`Validation failed: ${msg}`))
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus()
      const r = exception.getResponse()
      const message = typeof r === 'string' ? r : ((r as any)?.message ?? exception.message)
      return res.status(status).json(fail(Array.isArray(message) ? message.join('; ') : String(message)))
    }
    this.logger.error('Unhandled exception', exception instanceof Error ? exception.stack : String(exception))
    return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json(fail('Internal server error'))
  }
}
