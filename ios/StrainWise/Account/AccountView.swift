import SwiftUI

struct AccountView: View {
    @Environment(AuthSession.self) private var session
    var onFindAilments: (([String]) -> Void)? = nil
    @State private var showSignOut = false

    var body: some View {
        NavigationStack {
            ZStack {
                MeshBackground()
                ScrollView {
                    VStack(alignment: .leading, spacing: 20) {
                        header
                        SavedAilmentsCard(onFind: onFindAilments)
                        SavedMedicationsCard()
                        NavigationLink {
                            ReliefHistoryView()
                        } label: {
                            SWCard {
                                HStack {
                                    VStack(alignment: .leading, spacing: 4) {
                                        Text("Relief history")
                                            .font(.system(size: 16, weight: .semibold))
                                            .foregroundStyle(Palette.foreground)
                                        Text("How strains actually went for you")
                                            .font(.system(size: 13))
                                            .foregroundStyle(Palette.mutedForeground)
                                    }
                                    Spacer()
                                    Image(systemName: "chevron.right")
                                        .font(.system(size: 12, weight: .semibold))
                                        .foregroundStyle(Palette.mutedForeground)
                                }
                            }
                        }
                        .buttonStyle(.plain)
                        SWCard {
                            VStack(alignment: .leading, spacing: 10) {
                                labeled("Email", session.user?.email ?? "Not on file")
                                labeled("Account", "Same Firebase login as the web app")
                            }
                        }
                        SWPrimaryButton(title: "Sign out", systemImage: "rectangle.portrait.and.arrow.right") {
                            showSignOut = true
                        }
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, 8)
                    .padding(.bottom, 32)
                }
            }
            .navigationTitle("Account")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(.hidden, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    NavigationLink {
                        SavedStrainsView()
                    } label: {
                        Image(systemName: "heart")
                            .foregroundStyle(Palette.primary)
                    }
                    .accessibilityLabel("Saved strains")
                }
            }
            .confirmationDialog("Sign out of StrainEase?", isPresented: $showSignOut, titleVisibility: .visible) {
                Button("Sign out", role: .destructive) { session.signOut() }
                Button("Cancel", role: .cancel) {}
            }
        }
        .tint(Palette.primary)
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 10) {
            Eyebrow(text: "Settings")
            Text(session.user?.name ?? "Patient")
                .font(.system(.largeTitle, design: .serif).weight(.regular))
                .foregroundStyle(Palette.foreground)
            Text("Manage your ailments, account, and the strains you’ve liked.")
                .font(.system(size: 15))
                .foregroundStyle(Palette.mutedForeground)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private func labeled(_ title: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title.uppercased())
                .font(.system(size: 11, weight: .semibold))
                .tracking(1.2)
                .foregroundStyle(Palette.mutedForeground)
            Text(value)
                .font(.system(size: 16, weight: .medium))
                .foregroundStyle(Palette.foreground)
        }
    }
}

#Preview("Account") {
    AccountView()
        .environment(AuthSession.previewSignedIn)
        .environment(SavedStrainsStore.preview(["granddaddy-purple"]))
        .environment(SavedAilmentsStore.preview(["Anxiety"]))
        .environment(SavedMedicationsStore.preview(["Lexapro", "Ibuprofen"]))
        .environment(ReliefLogStore.preview([.sampleSleep]))
}
