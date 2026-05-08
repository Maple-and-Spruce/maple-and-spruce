/**
 * Employee repository
 *
 * The document ID is the user's Firebase Auth UID, which is also what
 * `hasRole(uid, Role.Employee)` reads from. Creating a doc here is what
 * grants the employee role.
 */
import { db, toDate } from './utilities/database.config';
import type {
  Employee,
  EmployeeStatus,
  CreateEmployeeInput,
  UpdateEmployeeInput,
} from '@maple/ts/domain';

const COLLECTION = 'employees';

function docToEmployee(
  doc: FirebaseFirestore.DocumentSnapshot
): Employee | undefined {
  if (!doc.exists) return undefined;
  const data = doc.data();
  if (!data) return undefined;

  return {
    id: doc.id,
    name: data['name'],
    email: data['email'],
    hourlyRate: data['hourlyRate'],
    status: data['status'],
    grantedBy: data['grantedBy'],
    grantedAt: toDate(data['grantedAt']),
    createdAt: toDate(data['createdAt']),
    updatedAt: toDate(data['updatedAt']),
  };
}

export const EmployeeRepository = {
  async findById(id: string): Promise<Employee | undefined> {
    const doc = await db.collection(COLLECTION).doc(id).get();
    return docToEmployee(doc);
  },

  async findAll(filters?: {
    status?: EmployeeStatus;
  }): Promise<Employee[]> {
    let query: FirebaseFirestore.Query = db.collection(COLLECTION);
    if (filters?.status) {
      query = query.where('status', '==', filters.status);
    }
    query = query.orderBy('name', 'asc');
    const snapshot = await query.get();
    return snapshot.docs
      .map((doc) => docToEmployee(doc))
      .filter((e): e is Employee => e !== undefined);
  },

  async create(
    input: CreateEmployeeInput & { grantedBy: string }
  ): Promise<Employee> {
    const docRef = db.collection(COLLECTION).doc(input.id);
    const now = new Date();

    const data = {
      name: input.name,
      email: input.email,
      hourlyRate: input.hourlyRate,
      status: 'active' as const,
      grantedBy: input.grantedBy,
      grantedAt: now,
      createdAt: now,
      updatedAt: now,
    };

    await docRef.set(data);

    return { id: input.id, ...data };
  },

  async update(input: UpdateEmployeeInput): Promise<Employee> {
    const { id, ...rest } = input;
    const docRef = db.collection(COLLECTION).doc(id);
    await docRef.update({ ...rest, updatedAt: new Date() });
    const doc = await docRef.get();
    const employee = docToEmployee(doc);
    if (!employee) {
      throw new Error(`Employee ${id} not found after update`);
    }
    return employee;
  },
};
