/**
 * VoiceBudget — полный код для Google Apps Script (Расширения → Apps Script).
 * Вставьте ВЕСЬ файл вместо старого Code.gs → Сохранить → Развернуть → Новая версия.
 */

function getOrCreateVoiceBudgetSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("VoiceBudget");
  if (!sheet) {
    sheet = ss.insertSheet("VoiceBudget");
    sheet.appendRow([
      "дата",
      "действие",
      "имя",
      "фамилия",
      "telegram",
      "telegram_user_id",
      "режим",
      "участников",
      "код",
      "id семьи",
      "сайт",
    ]);
  }
  return sheet;
}

function appendVoiceBudgetMember(data) {
  var sheet = getOrCreateVoiceBudgetSheet();
  sheet.appendRow([
    data.createdAt || "",
    data.actionLabel || data.action || "",
    data.firstName || "",
    data.lastName || "",
    data.telegram || "",
    data.telegramUserId || "",
    data.mode || "",
    data.memberCount || "",
    data.inviteCode || "",
    data.householdId || "",
    data.siteUrl || "",
  ]);
  SpreadsheetApp.flush();
}

function appendVoiceBudgetService(data) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Заявки");
  if (!sheet) {
    sheet = ss.insertSheet("Заявки");
    sheet.appendRow([
      "дата",
      "тема",
      "serviceId",
      "имя",
      "телефон",
      "telegram",
      "telegram_user_id",
      "сайт",
    ]);
  }
  sheet.appendRow([
    data.createdAt || new Date().toISOString(),
    data.serviceTopic || "",
    data.serviceId || "",
    data.fullName || "",
    data.phone || "",
    data.telegram || "",
    data.telegramUserId || "",
    data.siteUrl || "",
  ]);
  var row = sheet.getLastRow();
  if (data.highlightNew) {
    sheet.getRange(row, 1, row, 8).setBackground("#fff9c4");
  }
  SpreadsheetApp.flush();
}

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);

    if (data.type === "voicebudget_member") {
      appendVoiceBudgetMember(data);
    } else if (data.type === "voicebudget_service") {
      appendVoiceBudgetService(data);
    } else {
      return ContentService.createTextOutput(
        JSON.stringify({ ok: false, error: "unknown type: " + (data.type || "") }),
      ).setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(
      ContentService.MimeType.JSON,
    );
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: String(err) })).setMimeType(
      ContentService.MimeType.JSON,
    );
  }
}

function testVoiceBudgetMember() {
  appendVoiceBudgetMember({
    createdAt: new Date().toISOString(),
    actionLabel: "Тест",
    firstName: "Иван",
    lastName: "Иванов",
    telegram: "@test_user",
    telegramUserId: 123456789,
    mode: "Вдвоём",
    memberCount: 2,
    inviteCode: "ABC123",
    householdId: "test-household-id",
    siteUrl: "https://voicebudget.vercel.app",
  });
}

function testVoiceBudgetService() {
  appendVoiceBudgetService({
    type: "voicebudget_service",
    highlightNew: true,
    createdAt: new Date().toISOString(),
    serviceId: "osago",
    serviceTopic: "ОСАГО",
    fullName: "Тест",
    phone: "+79991234567",
    telegram: "@test",
    telegramUserId: 123456789,
    siteUrl: "https://voicebudget.vercel.app",
  });
}
