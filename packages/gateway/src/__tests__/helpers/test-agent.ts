import request from 'supertest';

export type IntegrationTestAgent = ReturnType<typeof request.agent>;
