import SwiftUI

struct ContentView: View {
    var body: some View {
        NavigationStack {
            VStack(spacing: 16) {
                Text("Welcome to Quare")
                    .font(.headline)
                    .foregroundColor(.secondary)
            }
            .navigationTitle("Quare")
            .navigationBarTitleDisplayMode(.large)
        }
    }
}

#Preview {
    ContentView()
}
