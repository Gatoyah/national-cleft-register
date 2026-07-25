// IndexedDB wrapper for offline-first storage
// This runs on the client side

const DB_NAME = "ncr_regional_hub";
const DB_VERSION = 1;

interface SyncQueueItem {
  id: string;
  tableName: string;
  operation: "create" | "update" | "delete";
  data: Record<string, unknown>;
  timestamp: number;
  attempts: number;
  lastError?: string;
}

interface PatientRecord {
  localId: string;
  firstName: string;
  lastName: string;
  middleName?: string;
  dateOfBirth: string;
  sex: string;
  regionOfResidence: string;
  districtOfResidence?: string;
  townVillage?: string;
  caregiverName: string;
  caregiverPhone?: string;
  caregiverRelationship?: string;
  cleftType?: string;
  syncStatus: "pending" | "synced" | "failed";
  ncrId?: string;
  createdAt: number;
  updatedAt: number;
}

interface SurgeryRecord {
  localId: string;
  patientLocalId: string;
  surgeryDate: string;
  surgeryType: string;
  isPrimarySurgery: boolean;
  surgeonName?: string;
  durationMinutes?: number;
  complications: boolean;
  complicationsDetails?: string;
  dischargeDate?: string;
  dischargeCondition?: string;
  syncStatus: "pending" | "synced" | "failed";
  createdAt: number;
  updatedAt: number;
}

let dbInstance: IDBDatabase | null = null;

export async function initDB(): Promise<IDBDatabase> {
  if (dbInstance) return dbInstance;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);

    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Patients store
      if (!db.objectStoreNames.contains("patients")) {
        const patientStore = db.createObjectStore("patients", { keyPath: "localId" });
        patientStore.createIndex("syncStatus", "syncStatus", { unique: false });
        patientStore.createIndex("ncrId", "ncrId", { unique: false });
        patientStore.createIndex("createdAt", "createdAt", { unique: false });
      }

      // Surgeries store
      if (!db.objectStoreNames.contains("surgeries")) {
        const surgeryStore = db.createObjectStore("surgeries", { keyPath: "localId" });
        surgeryStore.createIndex("patientLocalId", "patientLocalId", { unique: false });
        surgeryStore.createIndex("syncStatus", "syncStatus", { unique: false });
        surgeryStore.createIndex("surgeryDate", "surgeryDate", { unique: false });
      }

      // Sync queue store
      if (!db.objectStoreNames.contains("syncQueue")) {
        const syncStore = db.createObjectStore("syncQueue", { keyPath: "id" });
        syncStore.createIndex("timestamp", "timestamp", { unique: false });
        syncStore.createIndex("tableName", "tableName", { unique: false });
      }

      // Settings store (for facility config, last sync, etc.)
      if (!db.objectStoreNames.contains("settings")) {
        db.createObjectStore("settings", { keyPath: "key" });
      }
    };
  });
}

// ============================================================================
// PATIENT OPERATIONS
// ============================================================================

export async function savePatientOffline(patient: Omit<PatientRecord, "localId" | "syncStatus" | "createdAt" | "updatedAt">): Promise<PatientRecord> {
  const db = await initDB();
  const now = Date.now();
  const localId = crypto.randomUUID();

  const record: PatientRecord = {
    ...patient,
    localId,
    syncStatus: "pending",
    createdAt: now,
    updatedAt: now,
  };

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(["patients", "syncQueue"], "readwrite");
    const patientStore = transaction.objectStore("patients");
    const syncStore = transaction.objectStore("syncQueue");

    patientStore.add(record);
    
    // Add to sync queue
    syncStore.add({
      id: crypto.randomUUID(),
      tableName: "patients",
      operation: "create",
      data: record,
      timestamp: now,
      attempts: 0,
    });

    transaction.oncomplete = () => resolve(record);
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function getAllPatients(): Promise<PatientRecord[]> {
  const db = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction("patients", "readonly");
    const store = transaction.objectStore("patients");
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getPatientByLocalId(localId: string): Promise<PatientRecord | null> {
  const db = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction("patients", "readonly");
    const store = transaction.objectStore("patients");
    const request = store.get(localId);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

export async function getPendingPatients(): Promise<PatientRecord[]> {
  const db = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction("patients", "readonly");
    const store = transaction.objectStore("patients");
    const index = store.index("syncStatus");
    const request = index.getAll("pending");

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function updatePatientSyncStatus(localId: string, status: "pending" | "synced" | "failed", ncrId?: string): Promise<void> {
  const db = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction("patients", "readwrite");
    const store = transaction.objectStore("patients");
    const request = store.get(localId);

    request.onsuccess = () => {
      const patient = request.result;
      if (patient) {
        patient.syncStatus = status;
        patient.updatedAt = Date.now();
        if (ncrId) patient.ncrId = ncrId;
        store.put(patient);
      }
    };

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

// ============================================================================
// SURGERY OPERATIONS
// ============================================================================

export async function saveSurgeryOffline(surgery: Omit<SurgeryRecord, "localId" | "syncStatus" | "createdAt" | "updatedAt">): Promise<SurgeryRecord> {
  const db = await initDB();
  const now = Date.now();
  const localId = crypto.randomUUID();

  const record: SurgeryRecord = {
    ...surgery,
    localId,
    syncStatus: "pending",
    createdAt: now,
    updatedAt: now,
  };

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(["surgeries", "syncQueue"], "readwrite");
    const surgeryStore = transaction.objectStore("surgeries");
    const syncStore = transaction.objectStore("syncQueue");

    surgeryStore.add(record);
    
    syncStore.add({
      id: crypto.randomUUID(),
      tableName: "surgeries",
      operation: "create",
      data: record,
      timestamp: now,
      attempts: 0,
    });

    transaction.oncomplete = () => resolve(record);
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function getAllSurgeries(): Promise<SurgeryRecord[]> {
  const db = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction("surgeries", "readonly");
    const store = transaction.objectStore("surgeries");
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getSurgeriesByPatient(patientLocalId: string): Promise<SurgeryRecord[]> {
  const db = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction("surgeries", "readonly");
    const store = transaction.objectStore("surgeries");
    const index = store.index("patientLocalId");
    const request = index.getAll(patientLocalId);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getPendingSurgeries(): Promise<SurgeryRecord[]> {
  const db = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction("surgeries", "readonly");
    const store = transaction.objectStore("surgeries");
    const index = store.index("syncStatus");
    const request = index.getAll("pending");

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// ============================================================================
// SYNC QUEUE OPERATIONS
// ============================================================================

export async function getSyncQueue(): Promise<SyncQueueItem[]> {
  const db = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction("syncQueue", "readonly");
    const store = transaction.objectStore("syncQueue");
    const index = store.index("timestamp");
    const request = index.getAll();

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function removeSyncQueueItem(id: string): Promise<void> {
  const db = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction("syncQueue", "readwrite");
    const store = transaction.objectStore("syncQueue");
    store.delete(id);

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function updateSyncQueueItem(id: string, attempts: number, lastError?: string): Promise<void> {
  const db = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction("syncQueue", "readwrite");
    const store = transaction.objectStore("syncQueue");
    const request = store.get(id);

    request.onsuccess = () => {
      const item = request.result;
      if (item) {
        item.attempts = attempts;
        item.lastError = lastError;
        store.put(item);
      }
    };

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

// ============================================================================
// SETTINGS
// ============================================================================

export async function getSetting(key: string): Promise<unknown> {
  const db = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction("settings", "readonly");
    const store = transaction.objectStore("settings");
    const request = store.get(key);

    request.onsuccess = () => resolve(request.result?.value);
    request.onerror = () => reject(request.error);
  });
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  const db = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction("settings", "readwrite");
    const store = transaction.objectStore("settings");
    store.put({ key, value });

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

// ============================================================================
// STATISTICS
// ============================================================================

export async function getOfflineStats(): Promise<{
  totalPatients: number;
  totalSurgeries: number;
  pendingPatients: number;
  pendingSurgeries: number;
  syncQueueSize: number;
}> {
  const [patients, surgeries, syncQueue] = await Promise.all([
    getAllPatients(),
    getAllSurgeries(),
    getSyncQueue(),
  ]);

  return {
    totalPatients: patients.length,
    totalSurgeries: surgeries.length,
    pendingPatients: patients.filter((p) => p.syncStatus === "pending").length,
    pendingSurgeries: surgeries.filter((s) => s.syncStatus === "pending").length,
    syncQueueSize: syncQueue.length,
  };
}
