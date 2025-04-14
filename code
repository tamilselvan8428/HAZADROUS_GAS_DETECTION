#include <WiFi.h>
#include <WebServer.h>

const char* ssid = "OPPO A17k";
const char* password = "123456789";

const int mq6Pin = 34;
const int mq135Pin = 35;
const int ledPin = 32; // Define the LED pin

WebServer server(80);

unsigned long previousMillis = 0;
const long interval = 500;  
String sensorData = "";

const float methane_slope = 4;  
const float methane_intercept = 10;
const float ammonia_slope = 0.01;   
const float ammonia_intercept = 10; 

float analogToPPM(int rawValue, float slope, float intercept) {
  return slope * rawValue + intercept;
}

void setup() {
  Serial.begin(115200);
  delay(100);

  Serial.print("Connecting to ");
  Serial.println(ssid);
  WiFi.begin(ssid, password);

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println();
  Serial.println("WiFi connected.");
  Serial.print("IP address: ");
  Serial.println(WiFi.localIP());

  
  pinMode(mq6Pin, INPUT);
  pinMode(mq135Pin, INPUT);
  pinMode(ledPin, OUTPUT); // Set the LED pin as output

  server.on("/", handleRoot);
  server.on("/data", handleData);

  server.begin();
  Serial.println("HTTP server started.");
}

void loop() {
  server.handleClient();

  unsigned long currentMillis = millis();
  if (currentMillis - previousMillis >= interval) {
    previousMillis = currentMillis;
 
    int methaneRaw = analogRead(mq6Pin);
    int ammoniaRaw = analogRead(mq135Pin);
    
    float methanePPM = analogToPPM(methaneRaw, methane_slope, methane_intercept);
    float ammoniaPPM = analogToPPM(ammoniaRaw, ammonia_slope, ammonia_intercept);

    bool isMethaneHigh = methanePPM > 1000;
    bool isAmmoniaHigh = ammoniaPPM > 300;
    String status = (isMethaneHigh || isAmmoniaHigh) ? "Danger: High gas levels detected!" : "Gas levels are normal.";
    
    if (isMethaneHigh || isAmmoniaHigh) {
      digitalWrite(ledPin, HIGH);
    } else {
      digitalWrite(ledPin, LOW);
    }

    sensorData = "Methane level: " + String(methanePPM) + " ppm\n";
    sensorData += "Ammonia level: " + String(ammoniaPPM) + " ppm\n";
    sensorData += status;
  }
}

void handleRoot() {
  String htmlContent = "<html><head><title>Gas Level Sensor</title>";
  htmlContent += "<style>";
  htmlContent += "body {";
  htmlContent += "    font-family: Arial;";
  htmlContent += "    background-color: #000000;";
  htmlContent += "    text-align: center;";
  htmlContent += "    color: white;";
  htmlContent += "    height: 100vh;";
  htmlContent += "    margin: 0;";
  htmlContent += "}";
  htmlContent += "th, td {";
  htmlContent += "    border: 5px solid white;";
  htmlContent += "}";
  htmlContent += "</style>";
  htmlContent += "<script>";
  htmlContent += "function fetchData() {";
  htmlContent += "    fetch('/data').then(response => response.json()).then(data => {";
  htmlContent += "        document.getElementById('methane').innerText = data.methane;";
  htmlContent += "        document.getElementById('ammonia').innerText = data.ammonia;";
  htmlContent += "        document.getElementById('status').innerText = data.status;";
  htmlContent += "        if (data.isDangerous) {";
  htmlContent += "            alert(data.status);";
  htmlContent += "        }";
  htmlContent += "    });";
  htmlContent += "}";
  htmlContent += "setInterval(fetchData, 1000);"; 
  htmlContent += "</script>";
  htmlContent += "</head><body onload='fetchData()'>";
  htmlContent += "<table style='width:100%;height:20%; border: 5px solid white; border-collapse: collapse; font-size:40px;'>";
  htmlContent += "<tr>";
  htmlContent += "<td>Welcome To Gas Level Monitoring System !!!</td>";
  htmlContent += "</tr>";
  htmlContent += "</table>";
  htmlContent += "<br><br>";
  htmlContent += "<table style='width:60%;height:60%; border: 5px solid white; border-collapse: collapse; font-size:20px;'>";
  htmlContent += "<tr>";
  htmlContent += "<td style='width : 40%'>Methane Value</td>";
  htmlContent += "<td id='methane'>Loading...</td>";
  htmlContent += "</tr>";
  htmlContent += "<tr>";
  htmlContent += "<td style='width : 40%'>Ammonia Value</td>";
  htmlContent += "<td id='ammonia'>Loading...</td>";
  htmlContent += "</tr>";
  htmlContent += "<tr>";
  htmlContent += "<td style='width : 40%'>Status</td>";
  htmlContent += "<td id='status'>Loading...</td>";
  htmlContent += "</tr>";
  htmlContent += "</table>";
  htmlContent += "</body></html>";

  server.send(200, "text/html", htmlContent);
}

void handleData() {
  int methaneRaw = analogRead(mq6Pin);
  int ammoniaRaw = analogRead(mq135Pin);

  float methanePPM = analogToPPM(methaneRaw, methane_slope, methane_intercept);
  float ammoniaPPM = analogToPPM(ammoniaRaw, ammonia_slope, ammonia_intercept);

  bool isMethaneHigh = methanePPM > 1000;
  bool isAmmoniaHigh = ammoniaPPM > 300;
  bool isDangerous = isMethaneHigh || isAmmoniaHigh;
  String status = isDangerous ? "Danger: High gas levels detected!" : "Gas levels are normal.";

  String jsonData = "{";
  jsonData += "\"methane\": " + String(methanePPM) + ",";
  jsonData += "\"ammonia\": " + String(ammoniaPPM) + ",";
  jsonData += "\"status\": \"" + status + "\",";
  jsonData += "\"isDangerous\": " + String(isDangerous ? "true" : "false");
  jsonData += "}";

  server.send(200, "application/json", jsonData);
}
