import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  getFirestore,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import firebaseConfig from '@/firebase-applet-config.json';
import type {
  AudioQuality,
  DailyListeningLog,
  EQPresetId,
  Playlist,
  StreakState,
  Track,
} from '@/src/types/music';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

let connectionTested = false;
export async function testFirestoreConnection(): Promise<void> {
  if (connectionTested) return;
  connectionTested = true;
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

export async function signInWithGoogleCloud(): Promise<User> {
  const res = await signInWithPopup(auth, googleProvider);
  return res.user;
}

export async function signOutGoogleCloud(): Promise<void> {
  await signOut(auth);
}

function sanitizePlaylistId(rawId: string): string {
  const cleaned = rawId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
  return cleaned || `pl_${Date.now()}`;
}

const ensuredUserDocCache = new Map<string, Promise<void>>();

export async function ensureUserAccountDoc(user: User): Promise<void> {
  const cached = ensuredUserDocCache.get(user.uid);
  if (cached) return cached;

  const task = (async () => {
    const userPath = `users/${user.uid}`;
    const ref = doc(db, 'users', user.uid);
    try {
      const snap = await getDoc(ref);
      const safeEmail = (user.email || '').slice(0, 200);
      const safeDisplayName = (user.displayName || 'Pendengar Svara').slice(0, 120);
      if (!snap.exists()) {
        await setDoc(ref, {
          uid: user.uid,
          email: safeEmail,
          displayName: safeDisplayName,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        const existingData = snap.data();
        if (existingData?.email !== safeEmail || existingData?.displayName !== safeDisplayName) {
          await setDoc(
            ref,
            {
              email: safeEmail,
              displayName: safeDisplayName,
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          );
        }
      }
    } catch (error) {
      ensuredUserDocCache.delete(user.uid);
      handleFirestoreError(error, OperationType.WRITE, userPath);
    }
  })();

  ensuredUserDocCache.set(user.uid, task);
  return task;
}

function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefined(item)) as unknown as T;
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v !== undefined) {
        out[k] = stripUndefined(v);
      }
    }
    return out as T;
  }
  return value;
}

export interface CloudLibrarySnapshot {
  playlists: Playlist[];
  likedTracks: Track[];
  recentTracks: Track[];
  streak?: StreakState;
  dailyLogs?: Record<string, DailyListeningLog>;
  lyricOffsets?: Record<string, number>;
  audioQuality?: AudioQuality;
  eqPreset?: EQPresetId;
  eqGains?: number[];
  lowRamMode?: boolean;
}

export async function loadCloudLibrary(uid: string): Promise<CloudLibrarySnapshot | null> {
  const metaPath = `users/${uid}/meta/main`;
  const playlistsPath = `users/${uid}/playlists`;

  let metaSnap;
  try {
    metaSnap = await getDoc(doc(db, 'users', uid, 'meta', 'main'));
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, metaPath);
  }

  let playlistsSnap;
  try {
    const playlistsQuery = query(
      collection(db, 'users', uid, 'playlists'),
      where('ownerId', '==', uid)
    );
    playlistsSnap = await getDocs(playlistsQuery);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, playlistsPath);
  }

  const playlists: Playlist[] = [];
  playlistsSnap.forEach((docSnap) => {
    const data = docSnap.data() as Partial<Playlist> & { createdAt?: number };
    if (data && data.id && data.name && Array.isArray(data.tracks)) {
      playlists.push({
        id: String(data.id),
        name: String(data.name),
        description: String(data.description || ''),
        coverUrl: String(data.coverUrl || ''),
        createdAt: typeof data.createdAt === 'number' ? data.createdAt : Date.now(),
        updatedAt: Date.now(),
        tracks: data.tracks.slice(0, 200),
      });
    }
  });

  if (!metaSnap.exists() && playlists.length === 0) {
    return null;
  }

  const metaData = metaSnap.exists() ? metaSnap.data() : {};
  return {
    playlists,
    likedTracks: Array.isArray(metaData.likedTracks) ? (metaData.likedTracks as Track[]) : [],
    recentTracks: Array.isArray(metaData.recentTracks) ? (metaData.recentTracks as Track[]) : [],
    streak: metaData.streak as StreakState | undefined,
    dailyLogs: metaData.dailyLogs as Record<string, DailyListeningLog> | undefined,
    lyricOffsets: metaData.lyricOffsets as Record<string, number> | undefined,
    audioQuality: metaData.audioQuality as AudioQuality | undefined,
    eqPreset: metaData.eqPreset as EQPresetId | undefined,
    eqGains: Array.isArray(metaData.eqGains) ? (metaData.eqGains as number[]) : undefined,
    lowRamMode: typeof metaData.lowRamMode === 'boolean' ? metaData.lowRamMode : undefined,
  };
}

export async function syncPlaylistToCloud(uid: string, playlist: Playlist): Promise<void> {
  const safeId = sanitizePlaylistId(playlist.id);
  const docPath = `users/${uid}/playlists/${safeId}`;
  try {
    if (auth.currentUser) {
      await ensureUserAccountDoc(auth.currentUser);
    }
    const rawCover = playlist.coverUrl || '';
    const safeCover = rawCover.length <= 500 ? rawCover : '';
    await setDoc(doc(db, 'users', uid, 'playlists', safeId), {
      ownerId: uid,
      id: safeId,
      name: (playlist.name || 'Playlist').slice(0, 120),
      description: (playlist.description || '').slice(0, 400),
      coverUrl: safeCover,
      tracks: stripUndefined(playlist.tracks.slice(0, 200)),
      createdAt: typeof playlist.createdAt === 'number' ? playlist.createdAt : Date.now(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, docPath);
  }
}

export async function deletePlaylistFromCloud(uid: string, playlistId: string): Promise<void> {
  const safeId = sanitizePlaylistId(playlistId);
  const docPath = `users/${uid}/playlists/${safeId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'playlists', safeId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, docPath);
  }
}

export async function syncVaultMetaToCloud(
  uid: string,
  payload: {
    likedTracks: Track[];
    recentTracks: Track[];
    streak: StreakState;
    dailyLogs: Record<string, DailyListeningLog>;
    lyricOffsets: Record<string, number>;
    audioQuality: AudioQuality;
    eqPreset: EQPresetId;
    eqGains: number[];
    lowRamMode: boolean;
  }
): Promise<void> {
  const docPath = `users/${uid}/meta/main`;
  try {
    if (auth.currentUser) {
      await ensureUserAccountDoc(auth.currentUser);
    }
    const safeQuality: AudioQuality =
      payload.audioQuality === 'standard' ||
      payload.audioQuality === 'high' ||
      payload.audioQuality === 'hires' ||
      payload.audioQuality === 'flac' ||
      payload.audioQuality === 'alac'
        ? payload.audioQuality
        : 'hires';
    const normalizedGains = Array.from({ length: 5 }, (_, i) => {
      const val = payload.eqGains[i];
      return typeof val === 'number' && Number.isFinite(val) ? val : 0;
    });
    await setDoc(doc(db, 'users', uid, 'meta', 'main'), {
      ownerId: uid,
      likedTracks: stripUndefined(payload.likedTracks.slice(0, 200)),
      recentTracks: stripUndefined(payload.recentTracks.slice(0, 50)),
      streak: stripUndefined(payload.streak),
      dailyLogs: stripUndefined(payload.dailyLogs),
      lyricOffsets: stripUndefined(payload.lyricOffsets),
      audioQuality: safeQuality,
      eqPreset: String(payload.eqPreset || 'flat').slice(0, 24),
      eqGains: normalizedGains,
      lowRamMode: Boolean(payload.lowRamMode),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, docPath);
  }
}
