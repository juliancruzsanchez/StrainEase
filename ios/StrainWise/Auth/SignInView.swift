import SwiftUI

struct SignInView: View {
    @Environment(AuthSession.self) private var session
    @Environment(\.colorScheme) private var colorScheme
    @State private var mode: Mode = .signIn
    @State private var email = ""
    @State private var password = ""
    @FocusState private var focused: Field?

    enum Mode: Equatable {
        case signIn, signUp
        var title: String { self == .signIn ? "Welcome back" : "Create an account" }
        var subtitle: String {
            self == .signIn
                ? "Same account as the web app. Your research stays with you."
                : "One account for iPhone and the web. Email is enough to start."
        }
        var submit: String { self == .signIn ? "Sign in" : "Create account" }
        var togglePrompt: String { self == .signIn ? "New here?" : "Already have an account?" }
        var toggleAction: String { self == .signIn ? "Create an account" : "Sign in" }
    }

    enum Field { case email, password }

    var body: some View {
        ZStack {
            MeshBackground()
            ScrollView {
                VStack(alignment: .leading, spacing: 28) {
                    header
                    social
                    divider
                    form
                    if let error = session.errorMessage {
                        Text(error)
                            .font(.system(size: 13))
                            .foregroundStyle(Palette.destructive)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    footer
                }
                .padding(.horizontal, 22)
                .padding(.top, 28)
                .padding(.bottom, 40)
            }
            .scrollDismissesKeyboard(.interactively)
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 14) {
            Image("AppLogo")
                .resizable()
                .scaledToFit()
                .frame(width: 56, height: 56)
                .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            Eyebrow(text: "StrainEase")
            Text(mode.title)
                .font(.system(.largeTitle, design: .serif).weight(.regular))
                .foregroundStyle(Palette.foreground)
            Text(mode.subtitle)
                .font(.system(size: 16))
                .foregroundStyle(Palette.mutedForeground)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private var social: some View {
        VStack(spacing: 10) {
            Button {
                Task { await session.signInWithApple() }
            } label: {
                HStack(spacing: 10) {
                    Image(systemName: "apple.logo")
                        .font(.system(size: 17, weight: .semibold))
                    Text("Continue with Apple")
                        .font(.system(size: 16, weight: .semibold))
                }
                .frame(maxWidth: .infinity)
                .frame(height: 52)
                .foregroundStyle(colorScheme == .dark ? .black : .white)
                .background(colorScheme == .dark ? Color.white : Color.black, in: Capsule())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Continue with Apple")

            Button {
                Task { await session.signInWithGoogle() }
            } label: {
                HStack(spacing: 10) {
                    Image(systemName: "g.circle.fill")
                        .font(.system(size: 18))
                    Text("Continue with Google")
                        .font(.system(size: 16, weight: .semibold))
                }
                .frame(maxWidth: .infinity)
                .frame(height: 52)
                .foregroundStyle(Palette.foreground)
                .background(Palette.card, in: Capsule())
                .overlay(Capsule().strokeBorder(Palette.border, lineWidth: 1))
            }
            .buttonStyle(.plain)
        }
        .disabled(session.isBusy)
    }

    private var divider: some View {
        HStack(spacing: 12) {
            Rectangle().fill(Palette.border).frame(height: 1)
            Text("or email")
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(Palette.mutedForeground)
            Rectangle().fill(Palette.border).frame(height: 1)
        }
    }

    private var form: some View {
        VStack(alignment: .leading, spacing: 12) {
            SWField(placeholder: "Email", text: $email)
                .textContentType(.username)
                .keyboardType(.emailAddress)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .focused($focused, equals: .email)
            SecureField("Password", text: $password)
                .textContentType(mode == .signIn ? .password : .newPassword)
                .padding(.horizontal, 14)
                .padding(.vertical, 12)
                .background(Palette.card, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                        .strokeBorder(Palette.border, lineWidth: 1)
                )
                .focused($focused, equals: .password)
                .onSubmit { Task { await submit() } }

            SWPrimaryButton(
                title: mode.submit,
                systemImage: "arrow.right",
                isBusy: session.isBusy
            ) {
                Task { await submit() }
            }
            .padding(.top, 6)
        }
    }

    private var footer: some View {
        HStack(spacing: 6) {
            Text(mode.togglePrompt)
                .foregroundStyle(Palette.mutedForeground)
            Button(mode.toggleAction) {
                withAnimation(.snappy(duration: 0.25)) {
                    mode = mode == .signIn ? .signUp : .signIn
                    session.errorMessage = nil
                }
            }
            .fontWeight(.semibold)
            .foregroundStyle(Palette.primary)
        }
        .font(.system(size: 14))
        .frame(maxWidth: .infinity)
        .padding(.top, 4)
    }

    private func submit() async {
        focused = nil
        let mail = email.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !mail.isEmpty, !password.isEmpty else {
            session.errorMessage = "Enter an email and password."
            return
        }
        if mode == .signIn {
            await session.signIn(email: mail, password: password)
        } else {
            await session.signUp(email: mail, password: password)
        }
    }
}

#Preview("Sign in") {
    SignInView()
        .environment(AuthSession.previewSignedOut)
}

#Preview("Sign in · Dark") {
    SignInView()
        .environment(AuthSession.previewSignedOut)
        .preferredColorScheme(.dark)
}
