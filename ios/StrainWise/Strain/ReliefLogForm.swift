import SwiftUI

struct ReliefLogForm: View {
    let strainName: String
    var conditions: [String] = []
    @Environment(ReliefLogStore.self) private var logs
    @State private var open = false
    @State private var fit: ReliefFit = .justRight
    @State private var relief = 4
    @State private var note = ""
    @State private var extraCondition = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Button(open ? "Cancel" : "How did this go?") {
                open.toggle()
            }
            .font(.system(size: 13, weight: .semibold))
            .foregroundStyle(Palette.primary)
            .accessibilityLabel(open ? "Cancel relief log" : "Log how this strain went")

            if open {
                VStack(alignment: .leading, spacing: 12) {
                    FlowLayout(spacing: 8) {
                        ForEach(ReliefFit.allCases) { option in
                            SWChip(title: option.label, isOn: fit == option) {
                                fit = option
                            }
                        }
                    }
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Relief \(relief)/5")
                            .font(.system(size: 12, weight: .medium))
                            .foregroundStyle(Palette.mutedForeground)
                        Slider(value: Binding(
                            get: { Double(relief) },
                            set: { relief = Int($0.rounded()) }
                        ), in: 1...5, step: 1)
                        .tint(Palette.primary)
                    }
                    TextField("Optional note — e.g. slept 6 hours", text: $note)
                        .textInputAutocapitalization(.sentences)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 10)
                        .background(Palette.muted.opacity(0.6), in: Capsule())
                    if conditions.isEmpty {
                        TextField("What did you use it for? (e.g. insomnia)", text: $extraCondition)
                            .textInputAutocapitalization(.sentences)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 10)
                            .background(Palette.muted.opacity(0.6), in: Capsule())
                    }
                    Button {
                        Task { await save() }
                    } label: {
                        Text("Save log")
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(Palette.primaryForeground)
                            .padding(.horizontal, 14)
                            .padding(.vertical, 8)
                            .background(Palette.primary, in: Capsule())
                    }
                    .buttonStyle(.plain)
                    .disabled(logs.isBusy)
                }
                .padding(12)
                .background(Palette.muted.opacity(0.35), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            }
        }
    }

    private func save() async {
        var merged = conditions
        let extra = extraCondition.trimmingCharacters(in: .whitespacesAndNewlines)
        if !extra.isEmpty { merged.append(extra) }
        await logs.add(
            strainName: strainName,
            conditions: merged,
            fit: fit,
            relief: relief,
            note: note
        )
        open = false
        note = ""
        extraCondition = ""
    }
}

struct ReliefHistoryList: View {
    let logs: [ReliefLog]

    var body: some View {
        if logs.isEmpty {
            EmptyView()
        } else {
            VStack(alignment: .leading, spacing: 10) {
                SectionLabel("Relief history")
                ForEach(logs) { log in
                    SWCard {
                        VStack(alignment: .leading, spacing: 6) {
                            HStack {
                                Text(log.fit.label)
                                    .font(.system(size: 14, weight: .semibold))
                                    .foregroundStyle(Palette.foreground)
                                Spacer()
                                Text("\(log.relief)/5 relief")
                                    .font(.system(size: 13, weight: .medium))
                                    .foregroundStyle(Palette.mutedForeground)
                            }
                            if !log.conditions.isEmpty {
                                Text("for \(log.conditions.joined(separator: ", "))")
                                    .font(.system(size: 13))
                                    .foregroundStyle(Palette.mutedForeground)
                            }
                            if !log.note.isEmpty {
                                Text(log.note)
                                    .font(.system(size: 14))
                                    .foregroundStyle(Palette.foreground)
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                            Text(formatted(log.createdAt))
                                .font(.system(size: 11))
                                .foregroundStyle(Palette.mutedForeground)
                        }
                    }
                }
            }
        }
    }

    private func formatted(_ millis: Int) -> String {
        Date(timeIntervalSince1970: TimeInterval(millis) / 1000)
            .formatted(date: .abbreviated, time: .omitted)
    }
}
