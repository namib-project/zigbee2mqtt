const data = require("./stub/data");
const settings = require("../lib/util/settings");
const stringify = require("json-stable-stringify-without-jsonify");
const logger = require("./stub/logger");
const zigbeeHerdsman = require("./stub/zigbeeHerdsman");
const flushPromises = () => new Promise(setImmediate);
const MQTT = require("./stub/mqtt");
const Controller = require("../lib/controller");
const fs = require("fs");
const path = require("path");
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

const thingDescription = {
    "@context": ["http://www.w3.org/ns/td"],
    "@type": "ThingModel",
    title: "OSRAM Classic A60 RGBW",
    id: "urn:zigbee2mqtt:0x000b57fffec6a5b2",
    base: "mqtt://{{MQTT_BROKER_ADDRESS}}",
    securityDefinitions: {
        nosec_sc: {
            scheme: "nosec",
        },
    },
    security: "nosec_sc",
    properties: {
        transition: {
            type: "number",
            writeOnly: true,
            minimum: 0,
            forms: [
                {
                    op: "writeproperty",
                    href: "zigbee2mqtt/{{FRIENDLY_NAME}}/set/set_transition",
                },
            ],
        },
        rememberState: {
            type: "boolean",
            writeOnly: true,
            forms: [
                {
                    href: "zigbee2mqtt/{{FRIENDLY_NAME}}/set/remember_state",
                    op: "writeproperty",
                },
            ],
        },
        state: {
            title: "state",
            description: "On/off state of this light",
            type: "object",
            readOnly: true,
            properties: {
                state: {
                    type: "string",
                    enum: ["ON", "OFF"],
                },
            },
            required: ["state"],
            forms: [
                {
                    op: ["observeproperty", "unobserveproperty"],
                    href: "zigbee2mqtt/{{FRIENDLY_NAME}}",
                },
                {
                    op: "readproperty",
                    href: "zigbee2mqtt/{{FRIENDLY_NAME}}/get/state",
                    "mqv:responseTopic": "zigbee2mqtt/{{FRIENDLY_NAME}}",
                },
            ],
        },
        brightness: {
            title: "brightness",
            description: "Brightness of this light",
            type: "object",
            properties: {
                brightness: {
                    type: "number",
                    minimum: 0,
                    maximum: 254,
                },
                transition: {
                    type: "number",
                    minimum: 0,
                },
            },
            required: ["brightness"],
            forms: [
                {
                    op: ["observeproperty", "unobserveproperty"],
                    href: "zigbee2mqtt/{{FRIENDLY_NAME}}",
                },
                {
                    op: ["writeproperty"],
                    href: "zigbee2mqtt/{{FRIENDLY_NAME}}/set",
                },
                {
                    op: "readproperty",
                    href: "zigbee2mqtt/{{FRIENDLY_NAME}}/get/state",
                    "mqv:responseTopic": "zigbee2mqtt/{{FRIENDLY_NAME}}",
                },
            ],
        },
        linkquality: {
            type: "object",
            properties: {
                linkquality: {
                    type: "number",
                    minimum: 0,
                    maximum: 255,
                    unit: "lqi",
                },
            },
            required: ["linkquality"],
            forms: [
                {
                    op: ["observeproperty", "unobserveproperty"],
                    href: "zigbee2mqtt/{{FRIENDLY_NAME}}",
                },
            ],
        },
    },
    actions: {
        toggle: {
            input: {
                type: "string",
                const: "TOGGLE",
            },
            forms: [
                {
                    op: "invokeaction",
                    href: "zigbee2mqtt/{{FRIENDLY_NAME}}/set/state",
                },
            ],
        },
        on: {
            input: {
                type: "string",
                const: "ON",
            },
            forms: [
                {
                    op: "invokeaction",
                    href: "zigbee2mqtt/{{FRIENDLY_NAME}}/set/state",
                },
            ],
        },
        off: {
            input: {
                type: "string",
                const: "OFF",
            },
            forms: [
                {
                    op: "invokeaction",
                    href: "zigbee2mqtt/{{FRIENDLY_NAME}}/set/state",
                },
            ],
        },
        effect: {
            type: "string",
            enum: [
                "blink",
                "breathe",
                "okay",
                "channel_change",
                "finish_effect",
                "stop_effect",
            ],
            forms: [
                {
                    op: "invokeaction",
                    href: "zigbee2mqtt/{{FRIENDLY_NAME}}/set/effect",
                },
            ],
        },
    },
    events: {},
};

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
        const webofthingsmodule = new WebOfThings(null, null, null, null, {
            on: () => {},
        });

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
