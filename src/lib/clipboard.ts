// Copy a (sensitive) value to the clipboard and automatically clear it after a
// short delay, so secret material doesn't linger on the system clipboard where
// other apps can read it. Best-effort: clipboard APIs can reject when the tab is
// unfocused, and we only clear if the clipboard still holds what we wrote.

const CLEAR_AFTER_MS = 45_000

export async function copySensitive(value: string): Promise<boolean> {
  if (!navigator.clipboard?.writeText) return false
  try {
    await navigator.clipboard.writeText(value)
  } catch {
    return false
  }
  // Schedule a clear; only wipe if the clipboard still contains our value, so we
  // don't clobber something the user copied in the meantime.
  setTimeout(async () => {
    try {
      const current = await navigator.clipboard.readText()
      if (current === value) await navigator.clipboard.writeText('')
    } catch {
      // readText often denied without focus/permission — clear unconditionally
      try {
        await navigator.clipboard.writeText('')
      } catch {
        /* give up quietly */
      }
    }
  }, CLEAR_AFTER_MS)
  return true
}
