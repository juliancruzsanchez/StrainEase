import SwiftUI

struct SavedMedicationsCard: View {
    @Environment(SavedMedicationsStore.self) private var store
    @State private var draft = ""

    var body: some View {
        SWCard {
            VStack(alignment: .leading, spacing: 12) {
                SectionLabel("Medications")
                Text("Add anything you take — prescriptions, OTC, supplements. We’ll keep this in mind every time you research strains, and never tell you to stop a prescription.")
                    .font(.system(size: 13))
                    .foregroundStyle(Palette.mutedForeground)
                    .fixedSize(horizontal: false, vertical: true)

                if store.items.isEmpty {
                    Text("None saved yet.")
                        .font(.system(size: 13))
                        .foregroundStyle(Palette.mutedForeground)
                } else {
                    FlowLayout(spacing: 8) {
                        ForEach(store.items) { item in
                            HStack(spacing: 6) {
                                Text(item.name)
                                    .font(.system(size: 13, weight: .medium))
                                Button {
                                    Task { await store.remove(item) }
                                } label: {
                                    Image(systemName: "xmark")
                                        .font(.system(size: 10, weight: .semibold))
                                }
                                .buttonStyle(.plain)
                                .accessibilityLabel("Remove \(item.name)")
                            }
                            .foregroundStyle(Palette.primary)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 7)
                            .background(Palette.primary.opacity(0.12), in: Capsule())
                            .overlay(Capsule().strokeBorder(Palette.primary.opacity(0.4), lineWidth: 1))
                        }
                    }
                }

                HStack(spacing: 8) {
                    TextField("e.g. Lexapro, ibuprofen…", text: $draft)
                        .textInputAutocapitalization(.words)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 11)
                        .background(Palette.background, in: Capsule())
                        .overlay(Capsule().strokeBorder(Palette.border, lineWidth: 1))
                        .onSubmit { Task { await submit() } }
                    Button {
                        Task { await submit() }
                    } label: {
                        Image(systemName: "plus")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(Palette.primaryForeground)
                            .frame(width: 40, height: 40)
                            .background(Palette.primary, in: Circle())
                    }
                    .buttonStyle(.plain)
                    .disabled(draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || store.isBusy)
                    .opacity(draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? 0.45 : 1)
                    .accessibilityLabel("Add medication")
                }
            }
        }
    }

    private func submit() async {
        let trimmed = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        await store.add(trimmed)
        draft = ""
    }
}

#Preview("Medications") {
    SavedMedicationsCard()
        .padding()
        .environment(SavedMedicationsStore.preview(["Lexapro", "Ibuprofen"]))
}
#Preview("Empty") {
    SavedMedicationsCard()
        .padding()
        .environment(SavedMedicationsStore.preview())
}