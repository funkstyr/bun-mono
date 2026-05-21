import { customAlphabet } from "nanoid";

const alphabet = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const generate = customAlphabet(alphabet, 10);

export function generateSlug(): string {
  return generate();
}

export type SlugInsertResult = { collided: boolean };

export type SlugInsert = (slug: string) => Promise<SlugInsertResult>;

export async function generateSlugWithRetry(insert: SlugInsert): Promise<string> {
  const first = generateSlug();
  const r1 = await insert(first);
  if (!r1.collided) return first;

  const second = generateSlug();
  const r2 = await insert(second);
  if (!r2.collided) return second;

  throw new Error("slug_collision_after_retry");
}
