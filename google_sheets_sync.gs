/**
 * Google Apps Script for CoachTrack ET
 * 
 * HOW TO INSTALL IN YOUR GOOGLE SHEET:
 * 1. Open your Google Sheet ("SESSION TIMESHEET")
 * 2. Click "Extensions" > "Apps Script"
 * 3. Delete any code in the editor and paste this entire script.
 * 4. Click "Deploy" > "New deployment"
 * 5. Select type: "Web app"
 * 6. Set Description: "CoachTrack ET Webhook"
 * 7. Set "Execute as": "Me"
 * 8. Set "Who has access": "Anyone" (crucial for Telegram Mini App to send data)
 * 9. Click "Deploy", copy the "Web app URL", and paste it into the CoachTrack ET Settings tab!
 */

function doPost(e) {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    var data = JSON.parse(e.postData.contents);

    // Handle test ping
    if (data.test) {
      return ContentService.createTextOutput(JSON.stringify({ status: "success", message: "Webhook connected!" }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // Match exact columns from the timesheet:
    // [#, Date, Day, Start Time, End Time, Duration (hrs), Session?, Notes]
    var rowData = [
      data.number || "",
      data.date || "",
      data.day || "",
      data.startTime || "",
      data.endTime || "",
      data.duration !== undefined ? Number(data.duration).toFixed(2) : "",
      data.status || "YES",
      data.notes || ""
    ];

    // Find the next available row above the SUMMARY section or append to end
    sheet.appendRow(rowData);

    return ContentService.createTextOutput(JSON.stringify({ 
      status: "success", 
      message: "Row added successfully",
      row: rowData 
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ 
      status: "error", 
      message: error.toString() 
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  return ContentService.createTextOutput("CoachTrack ET Google Sheet Sync is live and running!");
}
