import SwiftUI

struct SplashView: View {
    var body: some View {
        ZStack {
            Color(red: 0.102, green: 0.102, blue: 0.18)
                .ignoresSafeArea()
            VStack(spacing: 16) {
                ZStack {
                    Circle()
                        .fill(Color(red: 0.424, green: 0.388, blue: 1.0))
                        .frame(width: 100, height: 100)
                    Text("Q")
                        .font(.system(size: 52, weight: .bold))
                        .foregroundColor(.white)
                }
                Text("Welcome to Quare")
                    .font(.title2)
                    .fontWeight(.semibold)
                    .foregroundColor(.white)
            }
        }
    }
}
