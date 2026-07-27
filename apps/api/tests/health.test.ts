```typescript
import request from 'supertest';
import app from '../src/app'; // Adjust the import path to your Express app instance

describe('Health Endpoint', () => {
  it('GET /api/health returns 200 with expected payload', async () => {
    const response = await request(app).get('/api/health');
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('status');
    // Add more specific assertions if needed, for example:
    // expect(response.body.status).toBe('ok');
  });
});
```;
