import { describe, expect, it } from "vitest";
import { registerSchema, updateProfileSchema } from "./auth";
import { AVATAR_KEYS, isAvatarKey, randomAvatar } from "./avatars";

describe("registerSchema", () => {
  it("normalise l'e-mail et le pseudo", () => {
    const r = registerSchema.parse({
      username: "  Frieren ",
      email: " Mage@Example.COM ",
      password: "motdepasse",
    });
    expect(r).toEqual({ username: "Frieren", email: "mage@example.com", password: "motdepasse" });
  });

  it("accepte les lettres accentuées dans le pseudo", () => {
    expect(
      registerSchema.safeParse({ username: "Élodie_2", email: "a@b.fr", password: "12345678" })
        .success,
    ).toBe(true);
  });

  it.each([
    ["ab", "trop court"],
    ["a".repeat(21), "trop long"],
    ["avec espace", "espace"],
    ["<script>", "caractères interdits"],
  ])("refuse le pseudo %s (%s)", (username) => {
    expect(
      registerSchema.safeParse({ username, email: "a@b.fr", password: "12345678" }).success,
    ).toBe(false);
  });

  it("refuse un mot de passe trop court et un e-mail invalide", () => {
    const r = registerSchema.safeParse({
      username: "abc",
      email: "pas-un-mail",
      password: "court",
    });
    expect(r.success).toBe(false);
    expect(r.error?.issues.map((i) => i.path[0]).sort()).toEqual(["email", "password"]);
  });
});

describe("updateProfileSchema", () => {
  it("exige au moins une modification", () => {
    expect(updateProfileSchema.safeParse({}).success).toBe(false);
  });
  it("refuse un avatar inconnu", () => {
    expect(updateProfileSchema.safeParse({ avatar: "dragon" }).success).toBe(false);
  });
});

describe("avatars", () => {
  it("propose 10 avatars et en tire un valide au hasard", () => {
    expect(AVATAR_KEYS).toHaveLength(10);
    expect(isAvatarKey(randomAvatar())).toBe(true);
    expect(randomAvatar(() => 0.999)).toBe(AVATAR_KEYS[9]);
  });
});
