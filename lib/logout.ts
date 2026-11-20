/**
 * Log out - the side menu's Logout and My Profile's Log Out are the same act: forget this
 * person's auto-saved drafts in this browser (`@minty/shared/drafts`, the owner's decisions doc L1;
 * resolves within 500 ms), then this app's token, then end the session at Minty (a form POST to
 * its /logout - a GET answers 405 - signs the person out and lands on the sign-in page - this
 * app's /login since phase 2), so no app is left signed in behind the one that said goodbye.
 *
 * Only this explicit sign-out removes the drafts: an ended session (the 401 path, lib/handoff.ts)
 * keeps them - they exist to survive it.
 */

import { clearDraftsForUser } from "@minty/shared/drafts";

import { clearAuth } from "@/lib/auth";
import { draftUserId } from "@/lib/draftScope";
import { env } from "@/lib/env";
import { postNavigate } from "@/lib/handoff";

export async function logOut(): Promise<void> {
  const userId = draftUserId();
  if (userId) await clearDraftsForUser(userId);
  clearAuth();
  postNavigate(`${env.ACCOUNTS_API_URL}/logout`);
}
