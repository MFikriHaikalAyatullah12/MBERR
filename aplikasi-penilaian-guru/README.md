# Aplikasi Penilaian Guru SD

Aplikasi web sederhana untuk membantu guru SD dalam mengelola penilaian siswa dengan mudah dan praktis.

## Fitur Utama

### 🔐 Autentikasi
- **Login/Register**: Sistem login dan pendaftaran untuk guru
- **Akses Terbatas**: Setiap guru hanya dapat mengakses 1 kelas untuk menjaga privasi

### 👨‍🎓 Manajemen Siswa
- Tambah, edit, dan hapus data siswa
- Input NIS (opsional)
- Daftar siswa per kelas

### 📊 Penilaian
- Input nilai untuk 10 mata pelajaran:
  - Bahasa Indonesia
  - Matematika
  - IPA
  - IPS
  - PKN
  - Agama
  - Seni Budaya
  - Olahraga
  - Bahasa Inggris
  - Muatan Lokal
- Nilai per semester dan tahun akademik
- Update dan hapus nilai

### 📈 Laporan
- Export data nilai ke Excel
- Export daftar siswa ke Excel
- Filter berdasarkan semester dan tahun akademik

### 🏫 Multi Kelas
- 6 room kelas yang berbeda (Kelas 1-6)
- Isolasi data antar kelas
- Dashboard per kelas

## Teknologi

### Backend
- **Node.js** dengan Express.js
- **SQLite** untuk database (ringan dan tidak perlu setup khusus)
- **JWT** untuk autentikasi
- **bcryptjs** untuk enkripsi password
- **XLSX** untuk export Excel

### Frontend
- **HTML5** dengan design responsif
- **CSS3** dengan Flexbox dan Grid
- **Vanilla JavaScript** (tanpa framework untuk performa optimal)
- **Font Awesome** untuk ikon

### Database
- **SQLite** - Database file lokal yang ringan
- Auto-create tables saat pertama kali dijalankan
- Data tersimpan permanen di file `database/school.db`

## Instalasi dan Menjalankan

### Persyaratan
- Node.js versi 14 atau lebih baru
- NPM (sudah termasuk dengan Node.js)

### Langkah Instalasi

1. **Clone atau download proyek ini**
   ```bash
   cd aplikasi-penilaian-guru
   ```

2. **Install dependencies untuk backend**
   ```bash
   cd backend
   npm install
   ```

3. **Jalankan aplikasi**
   ```bash
   npm start
   ```

4. **Buka browser dan akses**
   ```
   http://localhost:3000
   ```

### Mode Development (dengan auto-restart)
```bash
cd backend
npm run dev
```

## Struktur Proyek

```
aplikasi-penilaian-guru/
├── backend/
│   ├── models/
│   │   └── database.js          # Konfigurasi dan setup database
│   ├── routes/
│   │   ├── auth.js              # Route autentikasi (login/register)
│   │   ├── classes.js           # Route informasi kelas
│   │   ├── students.js          # Route manajemen siswa
│   │   ├── grades.js            # Route manajemen nilai
│   │   └── export.js            # Route export Excel
│   ├── middleware/
│   │   └── auth.js              # Middleware autentikasi dan autorisasi
│   ├── package.json
│   └── server.js                # Entry point server
├── frontend/
│   ├── css/
│   │   └── style.css            # Styling responsif lengkap
│   ├── js/
│   │   └── app.js               # JavaScript aplikasi
│   └── index.html               # Halaman utama (SPA)
├── database/
│   └── school.db                # Database SQLite (dibuat otomatis)
└── README.md
```

## Cara Penggunaan

### 1. Registrasi Guru Pertama
1. Buka aplikasi di browser
2. Klik tab "Daftar" 
3. Isi form registrasi:
   - Nama Lengkap
   - Username (unik)
   - Password
   - Pilih Kelas (yang belum diambil guru lain)
4. Klik "Daftar"

### 2. Login
1. Klik tab "Masuk"
2. Masukkan username dan password
3. Klik "Masuk"

### 3. Mengelola Data Siswa
1. Dari dashboard, klik "Data Siswa" di menu samping
2. Klik "Tambah Siswa" untuk menambah siswa baru
3. Isi nama siswa dan NIS (opsional)
4. Untuk edit/hapus, gunakan tombol di kolom "Aksi"

### 4. Input Penilaian
1. Klik "Penilaian" di menu samping
2. Pilih siswa, mata pelajaran, dan masukkan nilai (0-100)
3. Pilih semester dan tahun akademik
4. Klik "Simpan Nilai"
5. Nilai yang sudah ada akan diupdate otomatis

### 5. Export Laporan
1. Klik "Laporan" di menu samping
2. Untuk export nilai:
   - Pilih filter semester dan tahun (opsional)
   - Klik "Download" pada "Ekspor Nilai"
3. Untuk export daftar siswa:
   - Klik "Download" pada "Daftar Siswa"

## Keamanan

- Password di-hash menggunakan bcryptjs
- JWT token untuk autentikasi
- Autorisasi per kelas (guru tidak bisa akses kelas lain)
- Validasi input di backend dan frontend
- Token auto-refresh untuk menjaga sesi

## Responsif Design

Aplikasi ini didesain responsif dan dapat diakses dengan nyaman di:
- 💻 **Desktop/Laptop** - Full features dengan layout optimal
- 📱 **Android/Mobile** - Layout yang disesuaikan untuk layar kecil
- 📊 **Tablet** - Layout hybrid yang nyaman digunakan

## Browser Support

- Chrome (recommended)
- Firefox
- Safari
- Edge
- Opera

## Data Backup

Data tersimpan di file `database/school.db`. Untuk backup:
1. Copy file `database/school.db` ke lokasi aman
2. Untuk restore, replace file database dengan file backup

## Troubleshooting

### Port 3000 sudah digunakan
```bash
# Ubah port di backend/server.js atau set environment variable
PORT=3001 npm start
```

### Database error
```bash
# Hapus database dan restart (akan membuat database baru)
rm database/school.db
npm start
```

### Tidak bisa login setelah register
- Pastikan kelas yang dipilih belum diambil guru lain
- Check console browser untuk error

## Pengembangan Lanjutan

Untuk pengembangan lebih lanjut, Anda bisa:

1. **Tambah fitur**:
   - Upload foto siswa
   - Grafik statistik nilai
   - Notifikasi email
   - Absensi siswa

2. **Database upgrade**:
   - Migrasi ke PostgreSQL/MySQL untuk skala lebih besar
   - Implementasi ORM seperti Sequelize

3. **Security enhancement**:
   - Rate limiting
   - HTTPS
   - Environment variables untuk secret keys

4. **UI/UX improvements**:
   - Dark mode
   - Animasi lebih halus
   - Progressive Web App (PWA)

## Lisensi

MIT License - Bebas digunakan untuk keperluan pendidikan dan komersial.

## Kontributor

Dibuat oleh Fikri - Aplikasi penilaian guru SD yang sederhana dan praktis.

---

**Selamat menggunakan! Semoga aplikasi ini membantu memudahkan pekerjaan Anda sebagai guru.** 🎓✨
