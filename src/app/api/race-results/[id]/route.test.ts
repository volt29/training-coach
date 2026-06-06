import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  deleteMany: vi.fn(),
  getServerSession: vi.fn()
}));

vi.mock("@/auth", () => ({
  authOptions: {}
}));

vi.mock("next-auth", () => ({
  getServerSession: mocks.getServerSession
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    raceResult: {
      deleteMany: mocks.deleteMany
    }
  }
}));

describe("/api/race-results/[id]", () => {
  beforeEach(() => {
    mocks.deleteMany.mockReset();
    mocks.getServerSession.mockReset();
  });

  it("returns 401 for anonymous users", async () => {
    mocks.getServerSession.mockResolvedValue(null);
    const { DELETE } = await import("./route");

    const response = await DELETE(new Request("http://test.local/api/race-results/result-1"), {
      params: Promise.resolve({ id: "result-1" })
    });

    expect(response.status).toBe(401);
    expect(mocks.deleteMany).not.toHaveBeenCalled();
  });

  it("deletes only the authenticated user's race result", async () => {
    mocks.getServerSession.mockResolvedValue({ user: { id: "user-1" } });
    mocks.deleteMany.mockResolvedValue({ count: 1 });
    const { DELETE } = await import("./route");

    const response = await DELETE(new Request("http://test.local/api/race-results/result-1"), {
      params: Promise.resolve({ id: "result-1" })
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.deleted).toBe(true);
    expect(mocks.deleteMany).toHaveBeenCalledWith({
      where: {
        id: "result-1",
        userId: "user-1"
      }
    });
  });

  it("returns 404 when no owned race result is deleted", async () => {
    mocks.getServerSession.mockResolvedValue({ user: { id: "user-1" } });
    mocks.deleteMany.mockResolvedValue({ count: 0 });
    const { DELETE } = await import("./route");

    const response = await DELETE(new Request("http://test.local/api/race-results/result-1"), {
      params: Promise.resolve({ id: "result-1" })
    });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Nie znaleziono wyniku.");
  });
});
