import SwiftUI

struct TriedNotesView: View {
    let profile: StrainProfile
    @Environment(SavedStrainsStore.self) private var saved
    @Environment(AuthSession.self) private var session
    @State private var draft = ""
    @State private var draftPublic = false

    private var notes: [SavedNote] { saved.notes(for: profile.slug) }
    private var authorName: String { session.user?.name ?? "A patient" }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionLabel("Your notes")
            SWCard {
                VStack(alignment: .leading, spacing: 12) {
                    Text("Notes on how this strain felt when you tried it. Public notes are shared anonymously with other patients.")
                        .font(.system(size: 13))
                        .foregroundStyle(Palette.mutedForeground)
                        .fixedSize(horizontal: false, vertical: true)

                    if notes.isEmpty {
                        Text("Nothing here yet — one sentence is enough to start a record.")
                            .font(.system(size: 14))
                            .foregroundStyle(Palette.mutedForeground)
                    } else {
                        ForEach(notes) { note in
                            HStack(alignment: .top, spacing: 10) {
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(note.text)
                                        .font(.system(size: 15))
                                        .foregroundStyle(Palette.foreground)
                                        .fixedSize(horizontal: false, vertical: true)
                                    Text(Self.formatted(note.createdAt))
                                        .font(.system(size: 11))
                                        .foregroundStyle(Palette.mutedForeground)
                                }
                                Spacer(minLength: 8)
                                VStack(alignment: .trailing, spacing: 8) {
                                    Button {
                                        Task {
                                            await saved.setNotePublic(
                                                slug: profile.slug,
                                                noteId: note.id,
                                                isPublic: !note.isPublic,
                                                authorName: authorName,
                                                strainName: profile.name
                                            )
                                        }
                                    } label: {
                                        Label(
                                            note.isPublic ? "Public" : "Private",
                                            systemImage: note.isPublic ? "globe" : "lock"
                                        )
                                        .font(.system(size: 11, weight: .semibold))
                                        .foregroundStyle(note.isPublic ? Palette.primary : Palette.mutedForeground)
                                    }
                                    .buttonStyle(.plain)
                                    .accessibilityLabel(note.isPublic ? "Make note private" : "Share note publicly")
                                    Button {
                                        Task { await saved.removeNote(slug: profile.slug, noteId: note.id) }
                                    } label: {
                                        Image(systemName: "trash")
                                            .font(.system(size: 12, weight: .semibold))
                                            .foregroundStyle(Palette.destructive)
                                    }
                                    .buttonStyle(.plain)
                                    .accessibilityLabel("Delete note")
                                }
                            }
                            .padding(.vertical, 4)
                        }
                    }

                    HStack(spacing: 8) {
                        TextField("How did this one treat you?", text: $draft)
                            .textInputAutocapitalization(.sentences)
                            .submitLabel(.done)
                            .onSubmit { Task { await submit() } }
                            .padding(.horizontal, 12)
                            .padding(.vertical, 10)
                            .background(Palette.muted.opacity(0.6), in: Capsule())
                        Button {
                            draftPublic.toggle()
                        } label: {
                            Image(systemName: draftPublic ? "globe" : "lock")
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundStyle(draftPublic ? Palette.primary : Palette.mutedForeground)
                                .frame(width: 36, height: 36)
                                .background(Palette.muted.opacity(0.6), in: Circle())
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(draftPublic ? "New note will be public" : "New note will be private")
                        Button {
                            Task { await submit() }
                        } label: {
                            Text("Save")
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundStyle(Palette.primaryForeground)
                                .padding(.horizontal, 14)
                                .padding(.vertical, 10)
                                .background(Palette.primary, in: Capsule())
                        }
                        .buttonStyle(.plain)
                        .disabled(draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || saved.isBusy)
                    }
                }
            }
        }
    }

    private func submit() async {
        let text = draft
        let share = draftPublic
        draft = ""
        draftPublic = false
        await saved.addNote(to: profile, text: text, isPublic: share, authorName: authorName)
    }

    private static func formatted(_ millis: Int) -> String {
        let date = Date(timeIntervalSince1970: TimeInterval(millis) / 1000)
        return date.formatted(date: .abbreviated, time: .omitted)
    }
}
