# SquadSync 🌍✈️

**The ultimate collaborative trip planner for you and your squad.**

SquadSync transforms chaotic group chat planning into a sleek, real-time dashboard. Coordinate availability, manage multiple trips, and sync up with your friends efficiently.

# Squad Sync 🌍✈️
> **The Ultimate Group Trip Planner & Expense Tracker**

**Squad Sync** is a modern, real-time collaboration tool designed to make group travel seamless. From coordinating availabilities on a shared calendar to splitting costs with an intelligent debt settlement algorithm, Squad Sync keeps your trip organized and your friendships intact.

---

## 🚀 Live Demo
**[Launch App](https://squadsync-cxm.vercel.app/)**

---

## ✨ Key Features

### 🗓️ Smart Calendar
*   **Real-time Availability**: Statuses (Available, Busy, Maybe) sync instantly across all devices.
*   **Heatmap Visualization**: Easily spot the best dates for the whole group.
*   **Interactive UI**: "Black Marble" glassmorphism design with fluid animations.

### 💸 Intelligent Expense Tracking (New!)
*   **Group Split**: Log expenses in multiple currencies (USD, EUR, GBP, etc.).
*   **Debt Settlement Engine**: Automatically calculates **"Who Owes Whom"** to simplify payback.
    *   *Example: "John pays Sarah $50"* instead of confusing spreadsheets.
*   **Live Balances**: See your net standing (Owed vs. Owe) in real-time.

### 👥 Group Management
*   **Trip IDs**: Join trips instantly by sharing a unique 6-character code.
*   **Admin Dashboard**: Powerful controls to manage users, wipe data, or reset calendars (`cxm123`).
*   **Secure Authentication**: Powered by Firebase & Google Sign-In.

---

## 🛠️ Tech Stack
*   **Frontend**: React.js (Vite), Glassmorphism UI
*   **Backend**: Firebase (Firestore, Auth)
*   **Deployment**: Vercel

---

## 📦 Installation
1.  **Clone the repo**
    ```bash
    git clone https://github.com/JAXX399/squadsync-cxm.git
    cd squadsync-cxm
    ```
2.  **Install dependencies**
    ```bash
    npm install
    ```
3.  **Run locally**
    ```bash
    npm run dev
    ```

## 🔐 Admin Access
*   **Password**: *Check source code or ask admin*
*   **Capabilities**: Wipe all expenses, reset calendars, remove users.

---

Made with ❤️ by JAXX399

## 🚀 Getting Started

### Prerequisites

- Node.js (v16+)
- A Google Firebase Project (Free Tier)

### Installation

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/yourusername/squadsync.git
    cd squadsync
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Configure Firebase:**
    - Create a project at [firebase.google.com](https://console.firebase.google.com/).
    - Enable **Authentication** (Google Provider).
    - Enable **Firestore Database**.
    - Copy your config keys into `src/firebase.js`:
    ```javascript
    const firebaseConfig = {
      apiKey: "YOUR_API_KEY",
      authDomain: "YOUR_PROJECT.firebaseapp.com",
      projectId: "YOUR_PROJECT_ID",
      storageBucket: "YOUR_PROJECT.appspot.com",
      messagingSenderId: "...",
      appId: "..."
    };
    ```

4.  **Run the development server:**
    ```bash
    npm run dev
    ```

## 🛡️ Admin Access

Scale your community management with the built-in Admin Portal.
- **Access**: Click "Admin Access" in the dashboard footer.
- **Default Password**: *Check source code or ask admin* (Change this in `src/components/AdminDashboard.jsx`).
- **Capabilities**:
    - ⚡ **Avada Kedavra**: Instantly wipe all data for a fresh start.
    - 🗑️ **User/Trip Deletion**: maintain community standards.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1.  Fork the project
2.  Create your feature branch (`git checkout -b feature/AmazingFeature`)
3.  Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4.  Push to the branch (`git push origin feature/AmazingFeature`)
5.  Open a Pull Request

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.

---
*Built with ❤️ by Israr*
