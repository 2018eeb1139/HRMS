import { Injectable } from '@nestjs/common'
import { createHash } from 'node:crypto'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class AiCacheService {
  constructor(private readonly prisma: PrismaService) {}

  hashInput(obj: unknown): string {
    return createHash('sha256').update(JSON.stringify(obj)).digest('hex')
  }

  async getOrCompute<T>(args: {
    type: string
    inputHash: string
    model: string
    promptVersion: string
    compute: () => Promise<T>
  }): Promise<T> {
    const { type, inputHash, model, promptVersion, compute } = args

    const cached = await this.prisma.aiResult.findUnique({
      where: { type_inputHash_model_promptVersion: { type, inputHash, model, promptVersion } },
    })

    if (cached) {
      return cached.output as T
    }

    const output = await compute()

    await this.prisma.aiResult.upsert({
      where: { type_inputHash_model_promptVersion: { type, inputHash, model, promptVersion } },
      create: { type, inputHash, model, promptVersion, output: output as object },
      update: { output: output as object },
    })

    return output
  }
}
