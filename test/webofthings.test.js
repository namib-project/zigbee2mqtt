const data = require("./stub/data");
const settings = require("../lib/util/settings");
const stringify = require("json-stable-stringify-without-jsonify");
const logger = require("./stub/logger");
const zigbeeHerdsman = require("./stub/zigbeeHerdsman");
const flushPromises = () => new Promise(setImmediate);
const MQTT = require("./stub/mqtt");
const Controller = require("../lib/controller");
const WebOfThings = require("../lib/extension/webofthings");
const mockExit = jest.spyOn(process, "exit").mockImplementation(() => {});
const mocksClear = [
    zigbeeHerdsman.permitJoin,
    mockExit,
    MQTT.end,
    zigbeeHerdsman.stop,
    logger.debug,
    MQTT.publish,
    MQTT.connect,
    zigbeeHerdsman.devices.bulb_color.removeFromNetwork,
    zigbeeHerdsman.devices.bulb.removeFromNetwork,
    logger.error,
];

const thingDescription = require("./assets/mock-web-of-things")
const wotDiscoveryTopicPrefix = "wot/td";

describe("WebOfThings extension", () => {
    beforeEach(async () => {
        zigbeeHerdsman.returnDevices.splice(0);
        controller = new Controller();
        mocksClear.forEach((m) => m.mockClear());
        data.writeDefaultConfiguration();
        settings.reRead();
        data.writeDefaultState();
        settings.set(["webofthings"], true);
    });

    it("Should publish thing descriptions to the correct discovery topic", async () => {
        controller = new Controller(false);
        await controller.start();
        const webofthingsmodule = new WebOfThings(null, null, null, null, {
            on: () => {},
        });

        let payload = stringify(thingDescription);
        let brokerAddress = webofthingsmodule.getBrokerAddress();
        payload = payload.replace(/{{MQTT_BROKER_ADDRESS}}/g, brokerAddress);
        payload = payload.replace(/{{FRIENDLY_NAME}}/g, "bulb");
        await flushPromises();

        expect(MQTT.publish).toHaveBeenCalledWith(
            `${wotDiscoveryTopicPrefix}/bulb`,
            payload,
            { retain: true, qos: 0 },
            expect.any(Function)
        );
    });

    it("Should publish an updated thing description after a rename", async () => {
        controller = new Controller(false);
        await controller.start();
        const webofthingsmodule = new WebOfThings(null, null, null, null, {
            on: () => {},
        });

        await flushPromises();
        MQTT.publish.mockClear();
        MQTT.events.message(
            "zigbee2mqtt/bridge/request/device/rename",
            stringify({ from: "bulb", to: "smartlight" })
        );
        await flushPromises();

        let payload = stringify(thingDescription);
        let brokerAddress = webofthingsmodule.getBrokerAddress();
        payload = payload.replace(/{{MQTT_BROKER_ADDRESS}}/g, brokerAddress);
        payload = payload.replace(/{{FRIENDLY_NAME}}/g, "smartlight");

        expect(MQTT.publish).toHaveBeenCalledWith(
            `${wotDiscoveryTopicPrefix}/bulb`,
            null,
            { retain: true, qos: 0 },
            expect.any(Function)
        );

        expect(MQTT.publish).toHaveBeenCalledWith(
            `${wotDiscoveryTopicPrefix}/smartlight`,
            payload,
            { retain: true, qos: 0 },
            expect.any(Function)
        );
    });

    it("Should unpublish the thing description of a removed device", async () => {
        controller = new Controller(false);
        await controller.start();

        await flushPromises();
        MQTT.publish.mockClear();
        MQTT.events.message("zigbee2mqtt/bridge/config/remove", "bulb");
        await flushPromises();

        expect(MQTT.publish).toHaveBeenCalledWith(
            `${wotDiscoveryTopicPrefix}/bulb`,
            null,
            { retain: true, qos: 0 },
            expect.any(Function)
        );
    });
});
