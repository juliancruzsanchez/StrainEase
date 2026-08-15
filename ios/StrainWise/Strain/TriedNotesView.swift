import SwiftUI

struct TriedNotesView: View {
    let profile: StrainProfile
    @Environment(SavedStrainsStore.self) private var saved
    @State private var draft = ""

    private var notes: [SavedNote] { saved.notes(for: profile.slug) }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionLabel("Your notes")
            SWCard {
                VStack(alignment: .leading, spacing: 12) {
                    Text("Private notes on how this strain felt when you tried it.")
                        .font(.system(size: 13))
                        .foregroundStyle(Palette.mutedForeground)
                        .fixedSize(horizontal: false, vertical: true)

                    if notes.isEmpty {
                        Text("Nothing here yet — one sentence is enough to start a record.")
                            .font(.system(size: 14))
                            .foregroundStyle(Palette.mutedForeground)
                    } else {
                        ForEach(notes) { note in
                            VStack(alignment: .leading, spacing: 4) {
                                Text(note.text)
                                    .font(.system(size: 15))
                                    .foregroundStyle(Palette.foreground)
                                    .fixedSize(horizontal: false, vertical: true)
                                Text(Self.formatted(note.createdAt))
                                    .font(.system(size: 11))
                                    .foregroundStyle(Palette.mutedForeground)
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
        draft = ""
        await saved.addNote(to: profile, text: text)
    }

    private static func formatted(_ millis: Int) -> String {
        let date = Date(timeIntervalSince1970: TimeInterval(millis) / 1000)
        return date.formatted(date: .abbreviated, time: .omitted)
    }
}
