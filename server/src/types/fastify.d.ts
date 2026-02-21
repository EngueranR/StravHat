import type { FastifyReply, FastifyRequest } from "fastify";
import "fastify";

declare module "fastify" {
  interface FastifyRequest {
    userId: string;
    userIsAdmin: boolean;
  }

  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}
