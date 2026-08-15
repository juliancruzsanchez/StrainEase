import FirebaseAuth
import FirebaseFirestore
import Foundation

struct SavedNote: Identifiable, Hashable, Sendable {
    var id: String
    var text: String
    var isPublic: Bool
    var createdAt: Int
    var publicId: String?

    static func parse(_ raw: Any?) -> [SavedNote] {
        guard let rows = raw as? [[String: Any]] else { return [] }
        return rows.compactMap { row in
            guard let id = row["id"] as? String,
                  let text = row["text"] as? String
            else { return nil }
            return SavedNote(
                id: id,
                text: text,
                isPublic: row["isPublic"] as? Bool ?? false,
                createdAt: row["createdAt"] as? Int ?? 0,
                publicId: row["publicId"] as? String
            )
        }
    }
}

struct SavedStrainItem: Identifiable, Hashable, Sendable {
    var slug: String
    var name: String
    var type: StrainType?
    var thcRange: String?
    var imageUrl: String?
    var savedAt: Int
    var notes: [SavedNote]

    var id: String { slug }

    var profile: StrainProfile {
        StrainProfile(
            name: name,
            inKnowledgeBase: true,
            type: type,
            thcRange: thcRange,
            imageUrl: imageUrl
        )
    }

    init(
        slug: String,
        name: String,
        type: StrainType?,
        thcRange: String?,
        imageUrl: String?,
        savedAt: Int,
        notes: [SavedNote] = []
    ) {
        self.slug = slug
        self.name = name
        self.type = type
        self.thcRange = thcRange
        self.imageUrl = imageUrl
        self.savedAt = savedAt
        self.notes = notes
    }

    init(profile: StrainProfile, savedAt: Int = 0, notes: [SavedNote] = []) {
        slug = profile.slug
        name = profile.name
        type = profile.type
        thcRange = profile.thcRange
        imageUrl = profile.imageUrl
        self.savedAt = savedAt
        self.notes = notes
    }
}

/// Liked / saved strains — same `users/{uid}/savedStrains/{slug}` docs as the web app.
@Observable
@MainActor
final class SavedStrainsStore {
    private(set) var items: [SavedStrainItem] = []
    private(set) var isBusy = false
    var errorMessage: String?

    @ObservationIgnored private var listener: ListenerRegistration?
    @ObservationIgnored private let previewOnly: Bool

    var slugs: Set<String> { Set(items.map(\.slug)) }

    init() {
        previewOnly = false
    }

    /// In-memory store for SwiftUI previews and tests. Never talks to Firestore.
    static func preview(_ slugs: Set<String> = []) -> SavedStrainsStore {
        let items = slugs.map { slug -> SavedStrainItem in
            let profile = StrainCatalog.all.first { $0.slug == slug }
                ?? StrainProfile(name: slug, inKnowledgeBase: true)
            return SavedStrainItem(profile: profile)
        }
        return SavedStrainsStore(previewItems: items)
    }

    private init(previewItems: [SavedStrainItem]) {
        previewOnly = true
        items = previewItems
    }

    func isSaved(_ slug: String) -> Bool {
        items.contains { $0.slug == slug }
    }

    func listen(uid: String) {
        guard !previewOnly else { return }
        listener?.remove()
        listener = Firestore.firestore()
            .collection("users")
            .document(uid)
            .collection("savedStrains")
            .addSnapshotListener { [weak self] snap, error in
                Task { @MainActor in
                    guard let self else { return }
                    if let error {
                        self.errorMessage = error.localizedDescription
                        return
                    }
                    self.items = (snap?.documents ?? []).map { doc in
                        let data = doc.data()
                        let typeRaw = data["type"] as? String
                        return SavedStrainItem(
                            slug: doc.documentID,
                            name: data["name"] as? String ?? doc.documentID,
                            type: typeRaw.flatMap(StrainType.init(rawValue:)),
                            thcRange: data["thcRange"] as? String,
                            imageUrl: data["imageUrl"] as? String,
                            savedAt: data["savedAt"] as? Int ?? 0,
                            notes: SavedNote.parse(data["notes"])
                        )
                    }
                    .sorted { $0.savedAt > $1.savedAt }
                }
            }
    }

    func reset() {
        listener?.remove()
        listener = nil
        items = []
        errorMessage = nil
        isBusy = false
    }

    func toggle(_ profile: StrainProfile) async {
        let slug = profile.slug
        guard !slug.isEmpty, !isBusy else { return }
        let wasSaved = isSaved(slug)
        if wasSaved {
            items.removeAll { $0.slug == slug }
        } else {
            items.insert(SavedStrainItem(profile: profile, savedAt: Int(Date().timeIntervalSince1970 * 1000)), at: 0)
        }
        errorMessage = nil
        guard !previewOnly else { return }

        isBusy = true
        defer { isBusy = false }
        do {
            let ref = Firestore.firestore()
                .collection("users")
                .document(try currentUID())
                .collection("savedStrains")
                .document(slug)
            if wasSaved {
                try await ref.delete()
            } else {
                try await ref.setData(Self.document(for: profile), merge: true)
            }
        } catch {
            if wasSaved {
                items.insert(SavedStrainItem(profile: profile), at: 0)
            } else {
                items.removeAll { $0.slug == slug }
            }
            errorMessage = error.localizedDescription
        }
    }

    private func currentUID() throws -> String {
        guard let uid = Auth.auth().currentUser?.uid else {
            throw StrainAPIError.message("Sign in to save strains.")
        }
        return uid
    }

    func notes(for slug: String) -> [SavedNote] {
        items.first { $0.slug == slug }?.notes ?? []
    }

    /// Saves the strain if needed, then appends a private note — same shape as web `addNote`.
    func addNote(to profile: StrainProfile, text: String) async {
        let trimmed = String(text.trimmingCharacters(in: .whitespacesAndNewlines).prefix(1999))
        guard !trimmed.isEmpty, !profile.slug.isEmpty, !isBusy else { return }
        let note = SavedNote(
            id: "\(Int(Date().timeIntervalSince1970 * 1000))-\(UUID().uuidString.prefix(6).lowercased())",
            text: trimmed,
            isPublic: false,
            createdAt: Int(Date().timeIntervalSince1970 * 1000)
        )
        if let index = items.firstIndex(where: { $0.slug == profile.slug }) {
            items[index].notes.append(note)
        } else {
            items.insert(SavedStrainItem(profile: profile, savedAt: note.createdAt, notes: [note]), at: 0)
        }
        errorMessage = nil
        guard !previewOnly else { return }

        isBusy = true
        defer { isBusy = false }
        do {
            let ref = Firestore.firestore()
                .collection("users")
                .document(try currentUID())
                .collection("savedStrains")
                .document(profile.slug)
            try await ref.setData(Self.document(for: profile), merge: true)
            let next = items.first { $0.slug == profile.slug }?.notes ?? [note]
            try await ref.setData(["notes": next.map(Self.noteDocument)], merge: true)
        } catch {
            if let index = items.firstIndex(where: { $0.slug == profile.slug }) {
                items[index].notes.removeAll { $0.id == note.id }
            }
            errorMessage = error.localizedDescription
        }
    }

    func removeNote(slug: String, noteId: String) async {
        guard let index = items.firstIndex(where: { $0.slug == slug }) else { return }
        let previous = items[index].notes
        items[index].notes.removeAll { $0.id == noteId }
        errorMessage = nil
        guard !previewOnly else { return }
        isBusy = true
        defer { isBusy = false }
        do {
            try await Firestore.firestore()
                .collection("users")
                .document(try currentUID())
                .collection("savedStrains")
                .document(slug)
                .setData(
                    ["notes": items[index].notes.map(Self.noteDocument)],
                    merge: true
                )
        } catch {
            items[index].notes = previous
            errorMessage = error.localizedDescription
        }
    }

    /// Matches the web `saveStrain` payload. Notes are omitted so a re-save cannot wipe them.
    static func document(for profile: StrainProfile) -> [String: Any] {
        [
            "name": profile.name,
            "type": profile.type?.rawValue ?? NSNull(),
            "thcRange": profile.thcRange ?? NSNull(),
            "imageUrl": profile.imageUrl ?? NSNull(),
            "savedAt": Int(Date().timeIntervalSince1970 * 1000),
        ]
    }

    static func noteDocument(_ note: SavedNote) -> [String: Any] {
        var data: [String: Any] = [
            "id": note.id,
            "text": note.text,
            "isPublic": note.isPublic,
            "createdAt": note.createdAt,
        ]
        if let publicId = note.publicId {
            data["publicId"] = publicId
        }
        return data
    }
}
