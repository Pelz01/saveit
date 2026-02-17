// ──────────────────────────────────────────
// GRABH Firebase — Auth & Firestore
// Config loaded from /api/config (env vars)
// ──────────────────────────────────────────

let auth, db, googleProvider;
let firebaseReady = false;
let firebaseReadyPromise;

// Initialize Firebase from server config
firebaseReadyPromise = fetch(`${API_BASE}/api/config`)
  .then(r => r.json())
  .then(config => {
    if (!config.apiKey || config.apiKey === '' || config.apiKey === 'YOUR_API_KEY') {
      console.warn('[Firebase] No valid config found — auth disabled');
      return;
    }

    firebase.initializeApp(config);
    auth = firebase.auth();
    db = firebase.firestore();
    googleProvider = new firebase.auth.GoogleAuthProvider();
    firebaseReady = true;

    console.log('[Firebase] Initialized');
  })
  .catch(err => {
    console.warn('[Firebase] Failed to load config:', err);
  });

// ── Auth Functions ──

async function signInWithGoogle() {
  if (!firebaseReady) throw new Error('Firebase not configured');
  try {
    const result = await auth.signInWithPopup(googleProvider);
    await saveUserToFirestore(result.user);
    return result.user;
  } catch (err) {
    console.error('[Auth Error]', err);
    throw err;
  }
}

function signOutUser() {
  if (!firebaseReady) return Promise.resolve();
  return auth.signOut();
}

function getCurrentUser() {
  if (!firebaseReady) return null;
  return auth.currentUser;
}

function onAuthChange(callback) {
  // Wait for Firebase to initialize, then listen
  firebaseReadyPromise.then(() => {
    if (firebaseReady) {
      auth.onAuthStateChanged(callback);
    } else {
      // Firebase not configured — treat as no user
      callback(null);
    }
  });
}

// ── Firestore ──

async function saveUserToFirestore(user) {
  if (!firebaseReady || !user) return;

  const userRef = db.collection('users').doc(user.uid);
  const doc = await userRef.get();

  const userData = {
    email: user.email,
    displayName: user.displayName,
    photoURL: user.photoURL,
    uid: user.uid,
    lastDownload: firebase.firestore.FieldValue.serverTimestamp(),
  };

  if (!doc.exists) {
    userData.firstSeen = firebase.firestore.FieldValue.serverTimestamp();
    userData.downloadCount = 0;
  }

  await userRef.set(userData, { merge: true });
}

async function incrementDownloadCount() {
  if (!firebaseReady) return;
  const user = getCurrentUser();
  if (!user) return;

  await db.collection('users').doc(user.uid).update({
    downloadCount: firebase.firestore.FieldValue.increment(1),
    lastDownload: firebase.firestore.FieldValue.serverTimestamp(),
  });
}
