use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Instant;

use super::handshake::HandshakeRequest;
use crate::transport::TransportError;

/// Unique identifier for a host session.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct SessionId(u64);

impl SessionId {
    /// Creates a new session ID.
    #[must_use]
    fn new(id: u64) -> Self {
        Self(id)
    }

    /// Returns the raw ID value.
    #[must_use]
    pub fn as_u64(self) -> u64 {
        self.0
    }
}

/// State of a host session.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SessionState {
    /// Handshake in progress.
    Handshaking,
    /// Session is active and connected.
    Active,
    /// Session is disconnecting.
    Disconnecting,
    /// Session has been disconnected.
    Disconnected,
}

/// Information about a connected host session.
#[derive(Debug, Clone)]
pub struct HostSession {
    /// Unique session identifier.
    pub id: SessionId,
    /// Handshake request from the host.
    pub handshake: HandshakeRequest,
    /// Session state.
    pub state: SessionState,
    /// When the session was created.
    pub created_at: Instant,
    /// When the session was last active.
    pub last_active: Instant,
    /// Host identifier.
    pub host_id: Option<String>,
}

impl HostSession {
    /// Creates a new host session.
    #[must_use]
    pub fn new(id: SessionId, handshake: HandshakeRequest) -> Self {
        let now = Instant::now();
        let host_id = handshake.host_id.clone();
        Self {
            id,
            handshake,
            state: SessionState::Handshaking,
            created_at: now,
            last_active: now,
            host_id,
        }
    }

    /// Activates the session after successful handshake.
    pub fn activate(&mut self) {
        self.state = SessionState::Active;
        self.last_active = Instant::now();
    }

    /// Marks the session as disconnecting.
    pub fn disconnecting(&mut self) {
        self.state = SessionState::Disconnecting;
        self.last_active = Instant::now();
    }

    /// Marks the session as disconnected.
    pub fn disconnected(&mut self) {
        self.state = SessionState::Disconnected;
        self.last_active = Instant::now();
    }

    /// Updates the last active timestamp.
    pub fn touch(&mut self) {
        self.last_active = Instant::now();
    }

    /// Returns true if the session is active.
    #[must_use]
    pub fn is_active(&self) -> bool {
        self.state == SessionState::Active
    }
}

/// Connection registry for managing multiple host sessions.
pub struct ConnectionRegistry {
    /// Active sessions indexed by session ID.
    sessions: HashMap<SessionId, HostSession>,
    /// Counter for generating unique session IDs.
    next_id: AtomicU64,
    /// Maximum number of concurrent sessions.
    max_sessions: usize,
}

impl ConnectionRegistry {
    /// Creates a new connection registry.
    #[must_use]
    pub fn new(max_sessions: usize) -> Self {
        Self {
            sessions: HashMap::new(),
            next_id: AtomicU64::new(1),
            max_sessions,
        }
    }

    /// Registers a new host session from a handshake request.
    ///
    /// # Errors
    ///
    /// Returns `Err` if the maximum number of sessions is reached.
    pub fn register(&mut self, handshake: HandshakeRequest) -> Result<SessionId, TransportError> {
        if self.sessions.len() >= self.max_sessions {
            return Err(TransportError::Io(std::io::Error::new(
                std::io::ErrorKind::ConnectionRefused,
                format!("maximum sessions ({}) reached", self.max_sessions),
            )));
        }

        let id = SessionId::new(self.next_id.fetch_add(1, Ordering::SeqCst));
        let session = HostSession::new(id, handshake);
        self.sessions.insert(id, session);

        Ok(id)
    }

    /// Activates a session after successful handshake.
    ///
    /// # Errors
    ///
    /// Returns `Err` if the session doesn't exist.
    pub fn activate(&mut self, id: SessionId) -> Result<(), TransportError> {
        let session = self.sessions.get_mut(&id).ok_or_else(|| {
            TransportError::Io(std::io::Error::new(
                std::io::ErrorKind::NotFound,
                format!("session {} not found", id.as_u64()),
            ))
        })?;

        session.activate();
        Ok(())
    }

    /// Removes a session.
    ///
    /// # Errors
    ///
    /// Returns `Err` if the session doesn't exist.
    pub fn remove(&mut self, id: SessionId) -> Result<(), TransportError> {
        self.sessions.remove(&id).ok_or_else(|| {
            TransportError::Io(std::io::Error::new(
                std::io::ErrorKind::NotFound,
                format!("session {} not found", id.as_u64()),
            ))
        })?;
        Ok(())
    }

    /// Returns a session by ID.
    #[must_use]
    pub fn get(&self, id: SessionId) -> Option<&HostSession> {
        self.sessions.get(&id)
    }

    /// Returns a mutable session by ID.
    pub fn get_mut(&mut self, id: SessionId) -> Option<&mut HostSession> {
        self.sessions.get_mut(&id)
    }

    /// Returns all active sessions.
    #[must_use]
    pub fn active_sessions(&self) -> Vec<&HostSession> {
        self.sessions.values().filter(|s| s.is_active()).collect()
    }

    /// Returns the number of active sessions.
    #[must_use]
    pub fn active_count(&self) -> usize {
        self.sessions.values().filter(|s| s.is_active()).count()
    }

    /// Returns the total number of sessions (including inactive).
    #[must_use]
    pub fn total_count(&self) -> usize {
        self.sessions.len()
    }

    /// Returns true if the registry has reached capacity.
    #[must_use]
    pub fn is_at_capacity(&self) -> bool {
        self.sessions.len() >= self.max_sessions
    }

    /// Removes all disconnected sessions.
    pub fn cleanup_disconnected(&mut self) {
        self.sessions
            .retain(|_, session| session.state != SessionState::Disconnected);
    }
}

impl Default for ConnectionRegistry {
    fn default() -> Self {
        Self::new(16)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_handshake() -> HandshakeRequest {
        HandshakeRequest::new()
    }

    #[test]
    fn session_id_uniqueness() {
        let id1 = SessionId::new(1);
        let id2 = SessionId::new(2);
        assert_ne!(id1, id2);
    }

    #[test]
    fn host_session_new_starts_in_handshaking_state() {
        let handshake = test_handshake();
        let session = HostSession::new(SessionId::new(1), handshake);
        assert_eq!(session.state, SessionState::Handshaking);
    }

    #[test]
    fn host_session_activate_transitions_to_active() {
        let handshake = test_handshake();
        let mut session = HostSession::new(SessionId::new(1), handshake);
        session.activate();
        assert_eq!(session.state, SessionState::Active);
        assert!(session.is_active());
    }

    #[test]
    fn connection_registry_register() {
        let mut registry = ConnectionRegistry::new(10);
        let handshake = test_handshake();
        let id = registry.register(handshake).unwrap();
        assert!(registry.get(id).is_some());
    }

    #[test]
    fn connection_registry_rejects_at_capacity() {
        let mut registry = ConnectionRegistry::new(1);
        let _ = registry.register(test_handshake()).unwrap();
        let result = registry.register(test_handshake());
        assert!(result.is_err());
    }

    #[test]
    fn connection_registry_activate() {
        let mut registry = ConnectionRegistry::new(10);
        let id = registry.register(test_handshake()).unwrap();
        registry.activate(id).unwrap();
        assert!(registry.get(id).unwrap().is_active());
    }

    #[test]
    fn connection_registry_remove() {
        let mut registry = ConnectionRegistry::new(10);
        let id = registry.register(test_handshake()).unwrap();
        registry.remove(id).unwrap();
        assert!(registry.get(id).is_none());
    }

    #[test]
    fn connection_registry_active_sessions() {
        let mut registry = ConnectionRegistry::new(10);
        let id1 = registry.register(test_handshake()).unwrap();
        let _id2 = registry.register(test_handshake()).unwrap();
        registry.activate(id1).unwrap();

        let active = registry.active_sessions();
        assert_eq!(active.len(), 1);
        assert_eq!(active[0].id, id1);
    }

    #[test]
    fn connection_registry_cleanup_disconnected() {
        let mut registry = ConnectionRegistry::new(10);
        let id1 = registry.register(test_handshake()).unwrap();
        let _id2 = registry.register(test_handshake()).unwrap();

        // Disconnect first session
        {
            let session = registry.get_mut(id1).unwrap();
            session.disconnected();
        }

        registry.cleanup_disconnected();
        assert_eq!(registry.total_count(), 1);
    }
}
