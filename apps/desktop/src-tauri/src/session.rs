//! Session token storage in the OS credential store (Windows Credential Manager, macOS Keychain,
//! Linux Secret Service) via the `keyring` crate. The token is the Better Auth bearer token; it is
//! never written to localStorage or disk by the webview.
//!
//! Entries are keyed by an account name derived from the API base (`session@playwhip.com`), so a
//! staging or local build never reuses a production token.

use keyring::Entry;

const SERVICE: &str = "com.cheatcodemedia.whip";
const MAX_TOKEN_LEN: usize = 1024;

fn account(scope: &str) -> Result<String, String> {
    let ok = !scope.is_empty()
        && scope.len() <= 128
        && scope
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | ':' | '_'));
    if !ok {
        return Err("invalid session scope".into());
    }
    Ok(format!("session@{scope}"))
}

fn entry(scope: &str) -> Result<Entry, String> {
    Entry::new(SERVICE, &account(scope)?).map_err(|e| format!("credential store unavailable: {e}"))
}

/// The stored token, or `null` when signed out.
#[tauri::command]
pub async fn session_token_get(scope: String) -> Result<Option<String>, String> {
    match entry(&scope)?.get_password() {
        Ok(token) => Ok(Some(token)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("could not read the session: {e}")),
    }
}

#[tauri::command]
pub async fn session_token_set(scope: String, token: String) -> Result<(), String> {
    let printable = token.chars().all(|c| c.is_ascii_graphic());
    if token.is_empty() || token.len() > MAX_TOKEN_LEN || !printable {
        return Err("invalid session token".into());
    }
    entry(&scope)?
        .set_password(&token)
        .map_err(|e| format!("could not save the session: {e}"))
}

/// Sign-out: deletes the stored token (a no-op when there is none).
#[tauri::command]
pub async fn session_token_clear(scope: String) -> Result<(), String> {
    match entry(&scope)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("could not clear the session: {e}")),
    }
}

#[cfg(test)]
mod tests {
    use super::account;

    #[test]
    fn scopes_are_validated() {
        assert_eq!(account("playwhip.com").unwrap(), "session@playwhip.com");
        assert_eq!(account("localhost:8787").unwrap(), "session@localhost:8787");
        assert!(account("").is_err());
        assert!(account("a/b").is_err());
        assert!(account(&"x".repeat(129)).is_err());
    }
}
