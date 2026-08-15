import SwiftUI

struct ReliefHistoryView: View {
    @Environment(ReliefLogStore.self) private var logs

    var body: some View {
        ZStack {
            MeshBackground()
            if logs.logs.isEmpty {
                ContentUnavailableView(
                    "No relief logs yet",
                    systemImage: "moon.zzz",
                    description: Text("On a strain page, tap “How did this go?” after you try it.")
                )
            } else {
                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        ForEach(logs.logs) { log in
                            SWCard {
                                VStack(alignment: .leading, spacing: 6) {
                                    Text(log.strainName)
                                        .font(.system(.title3, design: .serif))
                                        .foregroundStyle(Palette.foreground)
                                    HStack {
                                        Text(log.fit.label)
                                            .font(.system(size: 14, weight: .semibold))
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
                                    Text(
                                        Date(timeIntervalSince1970: TimeInterval(log.createdAt) / 1000)
                                            .formatted(date: .abbreviated, time: .omitted)
                                    )
                                    .font(.system(size: 11))
                                    .foregroundStyle(Palette.mutedForeground)
                                }
                            }
                        }
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, 8)
                    .padding(.bottom, 32)
                }
            }
        }
        .navigationTitle("Relief history")
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(.hidden, for: .navigationBar)
    }
}

#Preview("Relief history") {
    NavigationStack {
        ReliefHistoryView()
    }
    .environment(ReliefLogStore.preview([.sampleSleep]))
}
