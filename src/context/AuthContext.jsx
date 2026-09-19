import { createContext, useContext, useEffect, useRef, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'firebase/auth';
import { doc, onSnapshot, serverTimestamp, runTransaction } from 'firebase/firestore';
import { auth, db } from '../firebase';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // firebase auth user
  const [profile, setProfile] = useState(null); // firestore users/{uid} doc
  const [loading, setLoading] = useState(true);
  const profileUnsubRef = useRef(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (fbUser) => {
      // Stop listening to the previous user's profile doc (if any) before
      // switching to the next one, so we never leak a listener or apply a
      // stale snapshot to the wrong account.
      if (profileUnsubRef.current) {
        profileUnsubRef.current();
        profileUnsubRef.current = null;
      }

      setUser(fbUser);

      if (fbUser) {
        // A LIVE listener (not a one-time getDoc) is what makes admin
        // approval / role changes take effect immediately for a user who
        // is already signed in — e.g. an admin flips someone from
        // "pending" to "active" in Firestore or the Users screen, and that
        // person's already-open tab updates on its own, no re-login
        // needed.
        profileUnsubRef.current = onSnapshot(
          doc(db, 'users', fbUser.uid),
          (snap) => {
            setProfile(snap.exists() ? snap.data() : null);
            setLoading(false);
          },
          () => {
            setProfile(null);
            setLoading(false);
          }
        );
      } else {
        setProfile(null);
        setLoading(false);
      }
    });
    return () => {
      unsub();
      if (profileUnsubRef.current) profileUnsubRef.current();
    };
  }, []);

  async function login(email, password) {
    await signInWithEmailAndPassword(auth, email, password);
  }

  // The very first account to ever sign up becomes an active admin
  // automatically (tracked by a system/meta.initialized flag); everyone
  // after that starts as "pending" until an admin approves them and assigns
  // a department in the Admin > Users screen. This is enforced again by the
  // Firestore security rules, so a modified client can't grant itself admin.
  async function signup(name, email, password) {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(cred.user, { displayName: name });

    const metaRef = doc(db, 'system', 'meta');
    const userRef = doc(db, 'users', cred.user.uid);

    const newProfile = await runTransaction(db, async (tx) => {
      const metaSnap = await tx.get(metaRef);
      const isFirstAdmin = !metaSnap.exists() || metaSnap.data().initialized !== true;
      const profileData = {
        name,
        email,
        role: isFirstAdmin ? 'admin' : 'pending',
        department: isFirstAdmin ? 'admin' : null,
        status: isFirstAdmin ? 'active' : 'pending',
        createdAt: serverTimestamp(),
      };
      tx.set(userRef, profileData);
      if (isFirstAdmin) tx.set(metaRef, { initialized: true }, { merge: true });
      return profileData;
    });

    setProfile(newProfile);
    return newProfile;
  }

  async function logout() {
    await signOut(auth);
  }

  const value = { user, profile, loading, login, signup, logout };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
