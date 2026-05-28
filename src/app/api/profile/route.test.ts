import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  findUnique: vi.fn(),
  upsert: vi.fn()
}));

vi.mock("@/auth", () => ({
  authOptions: {}
}));

vi.mock("next-auth", () => ({
  getServerSession: mocks.getServerSession
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    athleteProfile: {
      findUnique: mocks.findUnique,
      upsert: mocks.upsert
    }
  }
}));

describe("/api/profile", () => {
  beforeEach(() => {
    mocks.getServerSession.mockReset();
    mocks.findUnique.mockReset();
    mocks.upsert.mockReset();
  });

  it("returns 401 for anonymous users", async () => {
    mocks.getServerSession.mockResolvedValue(null);
    const { GET } = await import("./route");

    const response = await GET();

    expect(response.status).toBe(401);
  });

  it("upserts the authenticated user's profile", async () => {
    mocks.getServerSession.mockResolvedValue({ user: { id: "user-1" } });
    mocks.upsert.mockResolvedValue({
      id: "profile-1",
      userId: "user-1",
      level: "INTERMEDIATE",
      weeklyVolumeKm: 45,
      targetRace: "10 km",
      notes: ""
    });
    const { PUT } = await import("./route");
    const request = new Request("http://test.local/api/profile", {
      method: "PUT",
      body: JSON.stringify({
        level: "INTERMEDIATE",
        weeklyVolumeKm: 45,
        targetRace: "10 km",
        notes: ""
      })
    });

    const response = await PUT(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.profile.userId).toBe("user-1");
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user-1" }
      })
    );
  });
});
