# Project Name
# Wolfpack Guestbook - Version 1.0.7
## Purpose
Wolfpack Guestbook is an Electron-based desktop application designed to track attendance volume as a fully-enclosed software solution. It processes card swipe data or virtual keystrokes to extract user identification information, optionally display the result to the screen, and store it to a local-only SQLite3 database. This can later be exported to CSV for further examination and analysis.

## Target Audience
This application is intended for internal use by staff managing attendance of events at Madison Area Technical College.

## Overview
The application automatically detects connected MagTek HID devices, allows the user to select an appropriate device if multiple are available. Once a HID device is selected, the application listens for card swipe events and key-press events for "F24". An anonymous entry is entered on F24, and on card swipe the parsed data is inserted to the database as well as displayed for the user.

<strong>For more details see DOCUMENTATION.* (The PDF is formatted for end-users and letter-sized sheets)</strong>

# Guestbook Application

## Overview

The Guestbook Application is an Electron-based application that records guest entries via card swipe or manual entry. It supports integration with MagTek Swiper devices for card swipes and provides a manual entry option for guests who do not have a card. The application also includes features such as data export to CSV, password-protected viewer mode, and data management options.

## Features

- **Card Swipe Entry**: Automatically record guest details when a card is swiped using MagTek Swiper devices.
- **Manual Entry**: Provide guest details manually through a dedicated dialog accessible from the File menu.
- **Data Export**: Export guest records to a CSV file.
- **Data Management**: Flush data and set/change viewer passwords.
- **Secure Viewer**: View guest entries in a protected viewer window.

## Manual Entry Feature

A new Manual Entry feature has been added to ensure flexibility in recording guest entries in situations where a card swipe is not available.

### How to Use Manual Entry:

1. **Access the Manual Entry Dialog**:
   - Open the **File** menu in the application's menu bar.
   - Select the **Manual Entry** option. This action opens a modal dialog.

2. **Fill in the Form**:
   - **Name**: Enter the guest's name. This field is required.
   - **Onecard**: Enter the guest's Onecard number. This field is required and must be exactly 7 digits. If the Onecard input does not have exactly 7 digits, an error message will be displayed.

3. **Submit the Entry**:
   - Once the details are correctly filled, click the **Submit** button.
   - Upon successful validation, the entry is stored in the sqlite database with the current date and time, and the new entry will be displayed on the main application screen.

## Installation

1. Clone the repository.
2. Install required dependencies using `npm install`.
3. Configure the sqlite database as needed.
4. Start the application using `npm start`.

## Running the Application

- **Start the App**: Run `npm start` to launch the application.
- **Card Swipe**: Use a compatible MagTek Swiper device to record guest entries via card swipe.
- **Manual Entry**: Select **Manual Entry** from the **File** menu to open the modal form for manual guest entry.

## Development

- The backend is built with Node.js, using sqlite for data storage.
- The frontend is implemented using HTML, CSS, and JavaScript, running within an Electron application.
- The application leverages Electron's IPC mechanism to manage communication between the main and renderer processes.

## License

This project is licensed under the MIT License.
