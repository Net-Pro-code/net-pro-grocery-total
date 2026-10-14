# Net-Pro Grocery Total

A mobile app (React Native + Expo) for shoppers and shop staff. It scans the QR code on a grocery item, reads the item name and price, and keeps a running total in **Malawi Kwacha (MWK)**. Finished shopping lists are saved on the phone so they can be viewed later.

Course: CIS-MSD-321 Mobile Solutions Development (Assignment)

## Links

- Hosted web version: `https://clever-bavarois-1afc6e.netlify.app`
- Android app (APK): `https://expo.dev/accounts/rodmas/projects/grocery-qr-total/builds/a390aebc-3939-4c36-9c4d-3f8cab14f3b6`

## Features

- **Scan QR codes** with the phone camera. Each code holds `name,price`, for example `Rice 2kg,4500`.
- **Running total** in MWK, with a list of scanned items.
- **Quantities**: scanning the same item again adds 1 to its quantity. You can also use the − / + buttons or type a number (for example Sugar × 10).
- **Manual entry**: the **+ Add item** button adds an item by typing its name, price and quantity, with no QR code needed.
- **Remove / clear**: remove one item with ✕, or clear the whole list (asks for confirmation).
- **Save list**: stores the list with its date, time and total.
- **History**: shows past lists, expands to show their items, and lets you delete a list.
- **Offline storage**: everything is saved on the device and is still there after the app is closed and reopened. No internet or account is needed.

## Pages / screens

| Screen            | What it does                                                     |
| ----------------- | ---------------------------------------------------------------- |
| Scan              | Camera, total, item list, Clear / + Add item / Save list buttons |
| Add item (pop-up) | Manual entry of name, price and quantity                         |
| History           | Saved lists with totals; tap one to see its items                |

## QR code format

Plain text: `item name,price`

- The price is the number after the last comma. A trailing "MWK" is accepted.
- Item names may contain commas (for example `Beans, red 1kg,3200`).
- Sample codes to test with are in `sample-qr-codes.png` (print it or scan it from a screen).

## Environment variables (.env)

None. The app has no backend, no database server and no API keys. All data is stored on the device with AsyncStorage (browser local storage in the web version).

## Run it locally

Requires Node.js and the **Expo Go** app on an Android phone.

```
npm install
npx expo start
```

Scan the QR code shown in the terminal with Expo Go (phone and computer on the same Wi-Fi).

To run the web version in a browser instead:

```
npx expo start --web
```

## Build the Android APK

```
npm install -g eas-cli
eas login
eas build -p android --profile preview
```

## Build and deploy the web version

```
npx expo export --platform web
```

This creates a `dist` folder that can be uploaded to any static host (Netlify, Vercel and similar).

## Tech stack

React Native, Expo SDK 53, expo-camera (QR scanning), AsyncStorage (saving data), EAS Build (APK), react-native-web (web version).

## Notes

- In the web version, scanning uses the computer's webcam and needs camera permission. If there is no camera, **+ Add item** works the same way. The Android app is the main version.
- The app has been tested on a real Android phone. An iOS build has not been made.
